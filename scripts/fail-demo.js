// Shows the "model unavailable" path for real: the model URL is pointed at a
// closed local port, so the call genuinely fails. Works on macOS, Linux and Windows.
//   npm run fail-demo
//   npm run fail-demo -- "Any question"
import { ask } from '../src/helpdesk.js';
import { formatResult } from '../src/format.js';

const question = process.argv.slice(2).join(' ') || 'How do I reset my password?';
const env = { ...process.env, LLM_BASE_URL: 'http://127.0.0.1:9/v1', LLM_MODEL: process.env.LLM_MODEL || 'any-model' };

console.log(`Q: ${question}\n(model URL set to a closed port to simulate an outage)\n`);
const r = await ask(question, { env });
console.log(formatResult(r));
process.exitCode = r.status === 'error' ? 0 : 1; // success = the failure was handled
