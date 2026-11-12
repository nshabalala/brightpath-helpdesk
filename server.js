// Tiny web UI + JSON API. No dependencies.
//   GET  /          -> the help desk page
//   POST /api/ask   -> { question } => { status, answer, sources, quotes }
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { ask } from './src/helpdesk.js';

const PORT = Number(process.env.PORT || 8790);
const page = readFileSync(new URL('./public/index.html', import.meta.url));

createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(page);
  }
  if (req.method === 'POST' && req.url === '/api/ask') {
    let body = '';
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 10_000) return res.writeHead(413).end();
    }
    let question = '';
    try { question = JSON.parse(body).question; } catch { /* handled as empty */ }
    const result = await ask(question);
    res.writeHead(result.status === 'error' ? 503 : 200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(result));
  }
  res.writeHead(404).end();
}).listen(PORT, () => console.log(`BrightPath help desk on http://localhost:${PORT}`));
