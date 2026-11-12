// Minimal client for any OpenAI-compatible chat endpoint
// (Google AI Studio / Gemini, Groq, Ollama, LM Studio, OpenAI...).
// Configuration comes from environment variables only; no keys in code.

export class ModelUnavailableError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'ModelUnavailableError';
    this.cause = cause;
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
  return {
    baseUrl: baseUrl.replace(/\/$/, ''),
    model,
    apiKey: env.LLM_API_KEY || '',
    timeoutMs: Number(env.LLM_TIMEOUT_MS || 20000),
  };
}

export async function chat(messages, config, fetchImpl = fetch) {
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
      : res.status >= 500 ? 'the provider had an internal error'
      : `HTTP ${res.status}`;
    throw new ModelUnavailableError(`The AI model is unavailable right now (${hint}). Please try again shortly.`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new ModelUnavailableError('The AI model sent back an empty reply. Please try again.');
  }
  return content;
}
