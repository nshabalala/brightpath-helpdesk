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
  "I can't find that in the BrightPath help documents. Please contact support@brightpath.example (Monday to Friday, 09:00–17:00 UTC).";

function systemPrompt(docs) {
  const library = docs.map((d) => `<document id="${d.id}" title="${d.title}">\n${d.text}\n</document>`).join('\n\n');
  return `You are the help desk assistant for BrightPath Learn, a learning platform.
Answer ONLY from the documents below. Do not use outside knowledge and do not guess.
If the documents do not contain the answer, set "found" to false.
If a document says certain information is not available (for example pricing or refunds), set "found" to false.
Never ask the member for their password.
Write "answer" to the member, in plain friendly words. Some document lines are rules for you, the assistant
(for example "Never ask a member to send a password"); follow them, but do not repeat them to the member as-is.

Reply with JSON only, in this shape:
{"found": true|false, "answer": "short answer for the member", "sources": ["doc1"], "quotes": ["exact sentence copied from a cited document"]}

Every quote must be copied word for word from one of the cited documents.

${library}`;
}

const normalise = (s) => s.replace(/\s+/g, ' ').replace(/[‘’]/g, "'").replace(/[–—]/g, '-').trim().toLowerCase();

export function checkGrounding(parsed, docs) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const sources = (parsed.sources || []).filter((id) => byId.has(id));
  const quotes = (parsed.quotes || []).filter((q) => typeof q === 'string' && q.trim());
  if (!sources.length || !quotes.length) return { ok: false, reason: 'no valid source or quote cited' };
  const cited = sources.map((id) => normalise(byId.get(id).text));
  const missing = quotes.filter((q) => !cited.some((t) => t.includes(normalise(q))));
  if (missing.length) return { ok: false, reason: `quote not found in cited documents: "${missing[0]}"` };
  return { ok: true, sources };
}

/**
 * @returns {Promise<{status: 'answered'|'not_found'|'error', answer: string, sources: {id,title}[], quotes: string[], note?: string}>}
 */
export async function ask(question, { env = process.env, fetchImpl = fetch, docs = loadDocuments() } = {}) {
  const q = (question || '').trim();
  if (!q) return { status: 'error', answer: 'Please type a question.', sources: [], quotes: [] };

  let raw;
  try {
    const config = readConfig(env);
    raw = await chat(
      [
        { role: 'system', content: systemPrompt(docs) },
        { role: 'user', content: q },
      ],
      config,
      fetchImpl
    );
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      return { status: 'error', answer: err.message, sources: [], quotes: [] };
    }
    throw err;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return { status: 'error', answer: 'The AI model sent back a reply I could not read. Please try again.', sources: [], quotes: [] };
  }

  if (!parsed.found) {
    return { status: 'not_found', answer: NOT_FOUND_MESSAGE, sources: [], quotes: [] };
  }

  const grounding = checkGrounding(parsed, docs);
  if (!grounding.ok) {
    return { status: 'not_found', answer: NOT_FOUND_MESSAGE, sources: [], quotes: [], note: `Answer rejected by grounding check: ${grounding.reason}` };
  }

  const titles = new Map(docs.map((d) => [d.id, d.title]));
  return {
    status: 'answered',
    answer: String(parsed.answer || '').trim(),
    sources: grounding.sources.map((id) => ({ id, title: titles.get(id) })),
    quotes: parsed.quotes,
  };
}
