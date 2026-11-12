// Runs the three required cases against the REAL configured model and saves
// the output to results/results.md and results/results.json.
//   1. A question the documents answer
//   2. A question they do not answer
//   3. An API failure (same question, model URL pointed at a closed port)
import { writeFileSync, mkdirSync } from 'node:fs';
import { ask } from '../src/helpdesk.js';
import { formatResult } from '../src/format.js';

const cases = [
  { name: 'Supported question', question: 'When is the group coaching session, and where do I find the link?', env: process.env },
  { name: 'Unknown question', question: 'How much does the Foundations course cost, and can I get a refund?', env: process.env },
  { name: 'API failure', question: 'How do I reset my password?', env: { ...process.env, LLM_BASE_URL: 'http://127.0.0.1:9/v1' } },
];

const results = [];
for (const c of cases) {
  const started = Date.now();
  const r = await ask(c.question, { env: c.env });
  results.push({ case: c.name, question: c.question, ms: Date.now() - started, ...r });
  console.log(`\n## ${c.name}\nQ: ${c.question}\n${formatResult(r)}`);
}

mkdirSync('results', { recursive: true });
writeFileSync('results/results.json', JSON.stringify({ model: process.env.LLM_MODEL, ranAt: new Date().toISOString(), results }, null, 2));
writeFileSync(
  'results/results.md',
  `# Test results\n\nModel: \`${process.env.LLM_MODEL}\`  \nRan at: ${new Date().toISOString()}\n` +
    results.map((r) => `\n## ${r.case}\n\n**Question:** ${r.question}  \n**Status:** \`${r.status}\` (${r.ms} ms)\n\n\`\`\`\n${formatResult(r)}\n\`\`\`\n`).join('')
);
console.log('\nSaved results/results.md and results/results.json');
