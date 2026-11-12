// Minimal client for any OpenAI-compatible chat endpoint
// (Google AI Studio / Gemini, Groq, Ollama, LM Studio, OpenAI...).
// Configuration comes from environment variables only; no keys in code.

import { ModelUnavailableError } from './failures.js';

export { ModelUnavailableError };

export function readConfig(env = process.env) {
  const baseUrl = env.LLM_BASE_URL;
  const model = env.LLM_MODEL;
  if (!baseUrl || !model) throw new ModelUnavailableError('not_configured');
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(baseUrl);
  if (!env.LLM_API_KEY && !isLocal) {
    throw new ModelUnavailableError('no_key');
  }
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    model,
    apiKey: env.LLM_API_KEY || '',
    timeoutMs: Number(env.LLM_TIMEOUT_MS || 20000),
    retryDelayMs: Number(env.LLM_RETRY_DELAY_MS ?? 1000),
  };
}

// Free tiers return short-lived 429/5xx errors now and then (seen in testing),
// so a busy or server-error reply gets exactly one more attempt after a pause.
// Timeouts and connection failures are not retried: the member would wait too long.
export async function chat(messages, config, fetchImpl = fetch) {
  try {
    return await chatOnce(messages, config, fetchImpl);
  } catch (err) {
    if (!(err instanceof ModelUnavailableError) || !err.retryable) throw err;
    await new Promise((r) => setTimeout(r, config.retryDelayMs));
    return chatOnce(messages, config, fetchImpl);
  }
}

async function chatOnce(messages, config, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  let res;
  try {
    res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: 0,
        response_format: { type: 'json_object' },
        max_tokens: 800, // answers are a few sentences; caps cost and runaway replies
      }),
      signal: controller.signal,
    });
  } catch (err) {
    throw new ModelUnavailableError(err.name === 'AbortError' ? 'timeout' : 'unreachable', config, { cause: err });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const s = res.status;
    const kind =
      s === 401 || s === 403 ? 'key_rejected'
      : s === 400 ? 'request_rejected'
      : s === 404 ? 'model_not_found'
      : s === 429 ? 'rate_limited'
      : 'provider_error';
    throw new ModelUnavailableError(kind, { ...config, status: s }, { retryable: s === 429 || s >= 500 });
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new ModelUnavailableError('bad_reply');
  }
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new ModelUnavailableError('cut_off');
  }
  const content = choice?.message?.content;
  if (typeof content !== 'string') {
    throw new ModelUnavailableError('bad_reply');
  }
  return content;
}
