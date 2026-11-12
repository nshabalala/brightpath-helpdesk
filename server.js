// Tiny web UI + JSON API. No dependencies.
//   GET  /                -> the help desk page
//   GET  /api/documents   -> the member-facing lines of the three guides
//   POST /api/ask         -> { question } => { status, answer, sources, quotes }
//
// Listens on 127.0.0.1 only by default. Set HOST=0.0.0.0 to expose it.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { ask, tidy, MAX_QUESTION_LENGTH } from './src/helpdesk.js';
import { loadDocuments } from './src/documents.js';

const PORT = Number(process.env.PORT || 8790);
const HOST = process.env.HOST || '127.0.0.1';
const page = readFileSync(new URL('./public/index.html', import.meta.url));
// The guides shown on the site, one entry per line. Lines that are instructions
// for the assistant (not for members) are left out: they never reach the browser.
const STAFF_LINE = /^(This document does not contain|Never ask a member)/;
const documents = JSON.stringify(
  loadDocuments().map(({ id, title, text }) => ({
    id,
    title,
    lines: text.split('\n').slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith('Platform:'))
      .filter((l) => !STAFF_LINE.test(l)).map(tidy),
  }))
);

// There is no sign-in (the brief says none is needed), so each visitor is
// limited instead: at most LIMIT model questions per WINDOW_MS per IP address.
// Timestamps are checked when a request arrives; nothing runs on a timer.
const LIMIT = Number(process.env.RATE_LIMIT || 10);
const WINDOW_MS = 60_000;
const recent = new Map(); // ip -> request times in the current window
function allow(ip, now = Date.now()) {
  const times = (recent.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= LIMIT) {
    recent.set(ip, times);
    return false;
  }
  times.push(now);
  recent.set(ip, times);
  if (recent.size > 10_000) recent.delete(recent.keys().next().value);
  return true;
}

const HTTP_STATUS = { answered: 200, not_found: 200, invalid: 400, error: 503 };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/') return send(res, 200, page, 'text/html; charset=utf-8');
    if (req.method === 'GET' && req.url === '/api/documents') return send(res, 200, documents);
    if (req.url !== '/api/ask') return send(res, 404, { status: 'invalid', answer: 'Not found.' });
    if (req.method !== 'POST') return send(res, 405, { status: 'invalid', answer: 'Use POST.' });

    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > MAX_QUESTION_LENGTH * 4) {
        return send(res, 413, { status: 'invalid', answer: `Please keep your question under ${MAX_QUESTION_LENGTH} characters.`, sources: [], quotes: [] });
      }
    }
    let question = '';
    try { question = JSON.parse(body).question; } catch { /* treated as an empty question */ }

    if (!allow(req.socket.remoteAddress)) {
      return send(res, 429, { status: 'invalid', answer: 'You have asked a lot of questions in a short time. Please wait a minute and try again.', sources: [], quotes: [] });
    }

    const { note, ...result } = await ask(question);
    if (note) console.log(`[helpdesk] ${note}`); // diagnostic only, never sent to the browser; contains no question text
    return send(res, HTTP_STATUS[result.status] ?? 500, result);
  } catch (err) {
    console.error('[helpdesk] unexpected error:', err?.name || 'Error');
    if (!res.headersSent) send(res, 500, { status: 'error', answer: 'Something went wrong on our side. Please try again.', sources: [], quotes: [] });
  }
}).listen(PORT, HOST, () => console.log(`BrightPath help desk on http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`));
