// Answers a member's question using only the supplied documents.
//
// Flow:
//   1. Send the question plus all documents (each tagged with an id) to the model.
//   2. The model must reply in JSON: whether the docs answer it, the answer,
//      which doc ids support it, and short verbatim quotes.
//   3. Grounding check: every quote must really appear in a cited document.
//      If it does not, the answer is rejected and the member is told the
//      information is not available, instead of seeing a possibly invented answer.
import { loadDocuments } from './documents.js';
import { chat, readConfig, ModelUnavailableError } from './llm.js';

export const NOT_FOUND_MESSAGE =
  "I can't find that in the BrightPath help documents. Please contact support@brightpath.example (Monday to Friday, 09:00 to 17:00 UTC).";

function systemPrompt(docs) {
  const library = docs.map((d) => `<document id="${d.id}" title="${d.title}">\n${d.text}\n</document>`).join('\n\n');
  return `You are the help desk assistant for BrightPath Learn, a learning platform.
Answer ONLY from the documents below. Do not use outside knowledge and do not guess.
If the documents do not contain the answer, set "found" to false.
If a document says certain information is not available (for example pricing or refunds), set "found" to false.
Never ask the member for their password.
Write "answer" to the member, in plain friendly words, without dashes used as punctuation. Some document lines are rules for you, the assistant
(for example "Never ask a member to send a password"); follow them, but do not repeat them to the member as-is.

Reply with JSON only, in this shape:
{"found": true|false, "answer": "short answer for the member", "sources": ["doc1"], "quotes": ["exact sentence copied from a cited document"]}

Every quote must be copied word for word from one of the cited documents.

${library}`;
}

// Plain punctuation in everything shown to members: no long dashes, curly
// quotes or ellipsis characters, whatever the model or the documents use.
export function tidy(s) {
  return String(s)
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1 to $2')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...');
}

const normalise = (s) => s.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').trim().toLowerCase();

export function checkGrounding(parsed, docs) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const sources = (parsed.sources || []).filter((id) => byId.has(id));
  const quotes = (parsed.quotes || []).filter((q) => typeof q === 'string' && q.trim());
  if (!sources.length || !quotes.length) return { ok: false, reason: 'no valid source or quote cited' };
  const cited = sources.map((id) => normalise(byId.get(id).text));
  const missing = quotes.filter((q) => !cited.some((t) => t.includes(normalise(q))));
  if (missing.length) return { ok: false, reason: `${missing.length} quote(s) not found in the cited documents` };
  return { ok: true, sources, quotes };
}

export const MAX_QUESTION_LENGTH = 500;

const PASSWORD_MESSAGE =
  "Please don't share your password here: BrightPath will never ask for it, and your message was not passed to the AI. To reset your password, select Forgot password on the sign-in page.";

// Catches "my password is hunter2", "password: x", "pwd=x". Such questions are
// answered locally and never sent to the AI provider.
const SECRET_PATTERN = /\b(password|passcode|passwd|pwd|pin)\b\s*(is|was|=|:)\s*\S+/i;

// Identical questions reuse the earlier answer instead of paying for another
// model call. In memory, bounded, per process. Errors are never cached.
const MAX_CACHE = 200;
const defaultCache = new Map();
const cacheKey = (config, q) => `${config.baseUrl}|${config.model}|${q.toLowerCase().replace(/\s+/g, ' ').replace(/[?.!\s]+$/, '')}`;
function remember(cache, key, value) {
  if (!cache) return value;
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return value;
}

const result = (status, answer, extra = {}) => ({ status, answer, sources: [], quotes: [], ...extra });

/**
 * @returns {Promise<{status: 'answered'|'not_found'|'invalid'|'error', answer: string, sources: {id,title}[], quotes: string[], note?: string, cached?: boolean}>}
 *   invalid = problem with the question itself (never sent to the model)
 *   error   = the model could not be used
 *   note    = internal diagnostic, for the CLI and logs only
 */
export async function ask(question, { env = process.env, fetchImpl = fetch, docs = loadDocuments(), cache = defaultCache } = {}) {
  const q = String(question ?? '').trim();
  if (!q) return result('invalid', 'Please type a question.');
  if (q.length > MAX_QUESTION_LENGTH) return result('invalid', `Please keep your question under ${MAX_QUESTION_LENGTH} characters.`);
  if (SECRET_PATTERN.test(q)) return result('invalid', PASSWORD_MESSAGE);

  let config;
  let raw;
  try {
    config = readConfig(env);
    const hit = cache?.get(cacheKey(config, q));
    if (hit) return { ...hit, cached: true };
    raw = await chat(
      [
        { role: 'system', content: systemPrompt(docs) },
        { role: 'user', content: q },
      ],
      config,
      fetchImpl
    );
  } catch (err) {
    if (err instanceof ModelUnavailableError) return result('error', err.message);
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return result('error', 'The AI model sent back a reply I could not read. Please try again.');
  }

  const key = cacheKey(config, q);
  const notFound = (note) => remember(cache, key, result('not_found', NOT_FOUND_MESSAGE, note ? { note } : {}));
  const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : '';
  if (parsed.found !== true || !answer) return notFound();

  const grounding = checkGrounding(parsed, docs);
  if (!grounding.ok) return notFound(`Answer rejected by grounding check: ${grounding.reason}`);

  const titles = new Map(docs.map((d) => [d.id, d.title]));
  return remember(cache, key, result('answered', tidy(answer), {
    sources: grounding.sources.map((id) => ({ id, title: titles.get(id) })),
    quotes: grounding.quotes.map(tidy),
  }));
}
