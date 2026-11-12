// Offline tests: the model is replaced by a stub fetch, so these check the
// app's own logic (grounding, not-found handling, failure messages), not
// answer quality. Real-model results are in results/results.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ask as realAsk, NOT_FOUND_MESSAGE, tidy } from '../src/helpdesk.js';

// Each test gets no cache unless it asks for one.
const ask = (q, o = {}) => realAsk(q, { cache: null, ...o });

const env = { LLM_API_KEY: 'test-key', LLM_BASE_URL: 'http://stub', LLM_MODEL: 'stub', LLM_TIMEOUT_MS: '200', LLM_RETRY_DELAY_MS: '0' };
const reply = (obj, status = 200) => async () =>
  new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(obj) } }] }), { status });

test('answers with a verified source', async () => {
  const r = await ask('When is coaching?', {
    env,
    fetchImpl: reply({ found: true, answer: 'Tuesdays at 16:00 UTC.', sources: ['doc2'], quotes: ['A group coaching session takes place every Tuesday at 16:00 UTC.'] }),
  });
  assert.equal(r.status, 'answered');
  assert.deepEqual(r.sources.map((s) => s.id), ['doc2']);
});

test('model says not found -> not-found message', async () => {
  const r = await ask('How much does it cost?', { env, fetchImpl: reply({ found: false, answer: '', sources: [], quotes: [] }) });
  assert.equal(r.status, 'not_found');
  assert.equal(r.answer, NOT_FOUND_MESSAGE);
});

test('invented quote is rejected by the grounding check', async () => {
  const r = await ask('Is there a refund?', {
    env,
    fetchImpl: reply({ found: true, answer: 'Refunds within 30 days.', sources: ['doc3'], quotes: ['Refunds are available within 30 days.'] }),
  });
  assert.equal(r.status, 'not_found');
  assert.match(r.note, /grounding check/);
});

test('citing a document that does not exist is rejected', async () => {
  const r = await ask('x', { env, fetchImpl: reply({ found: true, answer: 'y', sources: ['doc9'], quotes: ['Platform: BrightPath Learn (fictional).'] }) });
  assert.equal(r.status, 'not_found');
});

test('connection failure -> clear unavailable message', async () => {
  const r = await ask('x', { env, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  assert.equal(r.status, 'error');
  assert.equal(r.reason, 'unreachable');
  assert.equal(r.setup, false);
  assert.match(r.answer, /can't be reached/);
  assert.match(r.hostHint, /Could not connect to http:\/\/stub/);
});

test('timeout -> clear unavailable message', async () => {
  const hang = (_url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const r = await ask('x', { env, fetchImpl: hang });
  assert.equal(r.status, 'error');
  assert.equal(r.reason, 'timeout');
  assert.match(r.hostHint, /No reply within 0.2 s/);
});

test('rate limit and bad key give specific messages', async () => {
  const busy = await ask('x', { env, fetchImpl: reply({}, 429) });
  assert.equal(busy.reason, 'rate_limited');
  assert.equal(busy.setup, false);
  const badKey = await ask('x', { env, fetchImpl: reply({}, 401) });
  assert.equal(badKey.reason, 'key_rejected');
  assert.equal(badKey.setup, true);
  assert.match(badKey.answer, /waiting for the host/);
  assert.match(badKey.hostHint, /rejected LLM_API_KEY/);
});

test('one retry on a server error, then success', async () => {
  let calls = 0;
  const fetchImpl = async (...a) => (++calls === 1 ? reply({}, 500)() : reply({ found: false, answer: '', sources: [], quotes: [] })());
  const r = await ask('x', { env, fetchImpl });
  assert.equal(calls, 2);
  assert.equal(r.status, 'not_found');
});

test('a bad key is not retried', async () => {
  let calls = 0;
  await ask('x', { env, fetchImpl: async () => { calls++; return reply({}, 401)(); } });
  assert.equal(calls, 1);
});

test('missing configuration is reported, not crashed on', async () => {
  const r = await ask('x', { env: {} });
  assert.equal(r.status, 'error');
  assert.equal(r.reason, 'not_configured');
  assert.equal(r.setup, true);
  assert.match(r.answer, /waiting for the host to connect a working AI model/);
  assert.match(r.hostHint, /Copy .env.example to .env/);
});

test('unreadable model reply is reported', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'not json' } }] }));
  const r = await ask('x', { env, fetchImpl });
  assert.equal(r.status, 'error');
});

test('a typed password is never sent to the model', async () => {
  let calls = 0;
  const r = await ask('my password is Hunter2, can you log in for me?', { env, fetchImpl: async () => { calls++; return reply({})(); } });
  assert.equal(calls, 0);
  assert.equal(r.status, 'invalid');
  assert.match(r.answer, /never ask for it/);
});

test('empty and over-long questions are rejected without a model call', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return reply({})(); };
  assert.equal((await ask('   ', { env, fetchImpl })).status, 'invalid');
  assert.equal((await ask('a'.repeat(501), { env, fetchImpl })).status, 'invalid');
  assert.equal(calls, 0);
});

test('an identical question reuses the cached answer', async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; return reply({ found: false, answer: '', sources: [], quotes: [] })(); };
  const cache = new Map();
  await realAsk('What is the refund policy?', { env, fetchImpl, cache });
  const second = await realAsk('  what is the refund policy ', { env, fetchImpl, cache });
  assert.equal(calls, 1);
  assert.equal(second.cached, true);
});

test('errors are not cached', async () => {
  let calls = 0;
  const cache = new Map();
  const fetchImpl = async () => { calls++; throw new TypeError('fetch failed'); };
  await realAsk('q', { env, fetchImpl, cache });
  await realAsk('q', { env, fetchImpl, cache });
  assert.equal(calls, 2);
});

test('JSON null, a cut-off reply and a non-JSON body are handled', async () => {
  const body = (content, extra = {}) => async () => new Response(JSON.stringify({ choices: [{ message: { content }, ...extra }] }));
  assert.equal((await ask('x', { env, fetchImpl: body('null') })).status, 'error');
  assert.equal((await ask('x', { env, fetchImpl: body('{"found":', { finish_reason: 'length' }) })).reason, 'cut_off');
  assert.equal((await ask('x', { env, fetchImpl: async () => new Response('<html>oops</html>') })).status, 'error');
});

test('found:true with an empty answer is treated as not found', async () => {
  const r = await ask('x', { env, fetchImpl: reply({ found: true, answer: '  ', sources: ['doc1'], quotes: ['Your next lesson appears on Home.'] }) });
  assert.equal(r.status, 'not_found');
});

test('a hosted provider with no key gives a clear message; a local model needs none', async () => {
  const noKey = { LLM_BASE_URL: 'https://example.com/v1', LLM_MODEL: 'm' };
  const nk = await ask('x', { env: noKey });
  assert.equal(nk.reason, 'no_key');
  assert.match(nk.answer, /waiting for the host/);
  assert.match(nk.hostHint, /LLM_API_KEY is empty/);
  const local = { LLM_BASE_URL: 'http://localhost:11434/v1', LLM_MODEL: 'm', LLM_RETRY_DELAY_MS: '0' };
  const r = await ask('x', { env: local, fetchImpl: reply({ found: false, answer: '', sources: [], quotes: [] }) });
  assert.equal(r.status, 'not_found');
});

test('answers and messages use plain punctuation', async () => {
  assert.equal(tidy('Support is 09:00\u201317:00 UTC \u2014 weekdays\u2026 \u201Cok\u201D'), 'Support is 09:00 to 17:00 UTC, weekdays... "ok"');
  assert.doesNotMatch(NOT_FOUND_MESSAGE, /[\u2013\u2014]/);
  const r = await ask('When?', { env, fetchImpl: reply({ found: true, answer: 'Tuesdays \u2014 16:00 UTC.', sources: ['doc2'], quotes: ['A group coaching session takes place every Tuesday at 16:00 UTC.'] }) });
  assert.equal(r.answer, 'Tuesdays, 16:00 UTC.');
  assert.equal(r.sources[0].title, 'Coaching and feedback');
});

test('every setup failure tells the member the help desk is waiting for the host', async () => {
  const cases = [[400, 'request_rejected'], [403, 'key_rejected'], [404, 'model_not_found']];
  for (const [status, reason] of cases) {
    const r = await ask('x', { env, fetchImpl: reply({}, status) });
    assert.equal(r.reason, reason);
    assert.equal(r.setup, true);
    assert.match(r.answer, /waiting for the host/);
    assert.doesNotMatch(r.answer, /LLM_|\.env|HTTP/); // no setup jargon for members
  }
  assert.match((await ask('x', { env, fetchImpl: reply({}, 404) })).hostHint, /model "stub" was not found/);
});

test('temporary failures ask the member to try again, with no setup jargon', async () => {
  const r = await ask('x', { env, fetchImpl: reply({}, 503) });
  assert.equal(r.reason, 'provider_error');
  assert.equal(r.setup, false);
  assert.match(r.answer, /try again/);
  assert.doesNotMatch(r.answer, /LLM_|\.env|HTTP/);
  assert.match(r.hostHint, /HTTP 503/);
});
