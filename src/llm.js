// Minimal client for any OpenAI-compatible chat endpoint
// (Google AI Studio / Gemini, Groq, Ollama, LM Studio, OpenAI...).
// Configuration comes from environment variables only; no keys in code.

export class ModelUnavailableError extends Error {
  constructor(message, cause, { retryable = false } = {}) {
    super(message);
    this.name = 'ModelUnavailableError';
    this.cause = cause;
    this.retryable = retryable;
  }
}

export function readConfig(env = process.env) {
  const baseUrl = env.LLM_BASE_URL;
  const model = env.LLM_MODEL;
  if (!baseUrl || !model) {
    throw new ModelUnavailableError(
      'No language model is configured. Set LLM_BASE_URL and LLM_MODEL (and LLM_API_KEY if your provider needs one). See .env.example.'
    );
  }
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(baseUrl);
  if (!env.LLM_API_KEY && !isLocal) {
    throw new ModelUnavailableError('No API key is set. Add your key to LLM_API_KEY in .env (see .env.example), or point LLM_BASE_URL at a local model.');
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
    const reason = err.name === 'AbortError' ? `no reply within ${config.timeoutMs / 1000}s` : 'could not connect';
    throw new ModelUnavailableError(`The AI model is unavailable right now (${reason}). Please try again shortly.`, err);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const hint =
      res.status === 401 || res.status === 403 ? 'the API key was rejected'
      : res.status === 429 ? 'the provider is rate limiting requests'
      : res.status === 400 ? 'the provider rejected the request; check LLM_MODEL and LLM_API_KEY'
      : res.status === 404 ? `model "${config.model}" was not found; check LLM_MODEL`
      : res.status >= 500 ? 'the provider had an internal error'
      : `HTTP ${res.status}`;
    const retryable = res.status === 429 || res.status >= 500;
    throw new ModelUnavailableError(`The AI model is unavailable right now (${hint}). Please try again shortly.`, undefined, { retryable });
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new ModelUnavailableError('The AI model sent back a reply I could not read. Please try again.');
  }
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new ModelUnavailableError('The AI model ran out of room before finishing its answer. Please try a shorter question.');
  }
  const content = choice?.message?.content;
  if (typeof content !== 'string') {
    throw new ModelUnavailableError('The AI model sent back an empty reply. Please try again.');
  }
  return content;
}
