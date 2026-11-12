// Loads the three supplied documents from ./docs.
// The documents are tiny, so the whole set is sent to the model with every
// question. See README "What I would improve" for how this changes at scale.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOCS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs');

export function loadDocuments(dir = DOCS_DIR) {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((file) => {
      const text = readFileSync(join(dir, file), 'utf8').trim();
      // "# Document 2 — Coaching and feedback" -> "Coaching and feedback"
      const title = text.split('\n')[0].replace(/^#\s*Document\s+\d+\s*[\u2013\u2014-]\s*/, '');
      const id = `doc${file.split('-')[0]}`; // "1-getting-started.md" -> "doc1"
      return { id, file, title, text };
    });
}
