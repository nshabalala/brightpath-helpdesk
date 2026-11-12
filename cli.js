#!/usr/bin/env node
// Usage:  node cli.js "How do I reset my password?"
//         node cli.js            (interactive: type questions, empty line to quit)
import { createInterface } from 'node:readline/promises';
import { ask } from './src/helpdesk.js';
import { formatResult } from './src/format.js';

const question = process.argv.slice(2).join(' ');

if (question) {
  const r = await ask(question);
  console.log(formatResult(r));
  process.exitCode = r.status === 'error' ? 1 : 0;
} else {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('BrightPath help desk. Ask a question (empty line to quit).');
  for (;;) {
    const q = (await rl.question('\n> ')).trim();
    if (!q) break;
    console.log(formatResult(await ask(q)));
  }
  rl.close();
}
