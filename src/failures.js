// Every way the AI model can fail, in one place.
//
//   member   what a student sees (plain words, no setup details)
//   host     what the person running the help desk must do (shown in the
//            terminal, and on the page only when opened on the host's own machine)
//   setup    true when it cannot work until the host fixes something;
//            false when it is temporary and trying again may help

const SETUP_MEMBER =
  'The help desk is waiting for the host to connect a working AI model. You can still browse the guides on this page, or email support@brightpath.example.';

const FAILURES = {
  not_configured: {
    setup: true,
    member: SETUP_MEMBER,
    host: () => 'No AI model is configured. Copy .env.example to .env, fill in LLM_BASE_URL, LLM_MODEL and LLM_API_KEY, then restart.',
  },
  no_key: {
    setup: true,
    member: SETUP_MEMBER,
    host: () => 'LLM_API_KEY is empty. Add a key to .env (a free one: aistudio.google.com/apikey) and restart, or point LLM_BASE_URL at a local model.',
  },
  key_rejected: {
    setup: true,
    member: SETUP_MEMBER,
    host: () => 'The AI provider rejected LLM_API_KEY. Check the key is correct and still active, update .env and restart.',
  },
  request_rejected: {
    setup: true,
    member: SETUP_MEMBER,
    host: () => 'The AI provider rejected the request (HTTP 400). This usually means the API key or the model name is wrong. Check LLM_API_KEY and LLM_MODEL in .env and restart.',
  },
  model_not_found: {
    setup: true,
    member: SETUP_MEMBER,
    host: (c) => `The model "${c.model}" was not found for this key. Set LLM_MODEL in .env to a model your key can use and restart.`,
  },
  unreachable: {
    setup: false,
    member: "The AI model can't be reached right now. Please try again in a moment.",
    host: (c) => `Could not connect to ${c.baseUrl}. Check LLM_BASE_URL and this machine's internet connection.`,
  },
  timeout: {
    setup: false,
    member: 'The AI model took too long to answer. Please try again in a moment.',
    host: (c) => `No reply within ${c.timeoutMs / 1000} s. The provider may be overloaded; LLM_TIMEOUT_MS sets the limit.`,
  },
  rate_limited: {
    setup: false,
    member: 'The help desk is busy right now. Please wait a minute and try again.',
    host: () => 'The AI provider is rate limiting requests (HTTP 429). Free tiers allow only a few requests a minute.',
  },
  provider_error: {
    setup: false,
    member: 'The AI model is having a problem right now. Please try again in a moment.',
    host: (c) => `The AI provider returned a server error (HTTP ${c.status}) twice in a row.`,
  },
  bad_reply: {
    setup: false,
    member: "The AI model sent back a reply I couldn't read. Please try again.",
    host: () => 'The provider replied with something that was not the expected JSON. Retrying usually works; if it keeps happening, try another model.',
  },
  cut_off: {
    setup: false,
    member: 'That answer was too long to finish. Please try a shorter or more specific question.',
    host: () => 'The model hit the reply size limit (max_tokens 800).',
  },
};

export class ModelUnavailableError extends Error {
  /** @param {keyof typeof FAILURES} kind */
  constructor(kind, context = {}, { retryable = false, cause } = {}) {
    const f = FAILURES[kind];
    super(f.member);
    this.name = 'ModelUnavailableError';
    this.kind = kind;
    this.setup = f.setup;
    this.hostHint = f.host(context);
    this.retryable = retryable;
    this.cause = cause;
  }
}

export const isSetupKind = (kind) => Boolean(FAILURES[kind]?.setup);
