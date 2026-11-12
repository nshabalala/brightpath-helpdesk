# BrightPath Help Desk

A small AI help desk that answers member questions **only** from the three supplied BrightPath documents, shows which document supports each answer, says so when the answer is not there, and gives a clear message when the model is unavailable.

No dependencies. Node 22+ only.

## Run it

```bash
cp .env.example .env        # then add a free key, e.g. Google AI Studio
npm run ask -- "When is group coaching?"     # one question
npm run ask                                   # interactive
npm start                                     # web page on http://localhost:8790
```

Any OpenAI-compatible endpoint works (Gemini via AI Studio, Groq, Ollama, LM Studio). Configuration is read from `.env` / environment only; no keys are in the code.

## Tests

```bash
npm test          # offline logic tests (model replaced by a stub)
npm run fail-demo # real API failure: points the model URL at a closed port
npm run cases     # the three required cases against the real model -> results/
```

`npm test` covers: verified answer, model says not found, invented quote rejected, unknown document id rejected, connection failure, timeout, rate limit, bad key, missing config, unreadable model reply.

The real-model results are in [`results/results.md`](results/results.md).

## How it works

1. **All three documents go to the model** with each question, each tagged with an id (`doc1`, `doc2`, `doc3`). They are tiny, so retrieval would add complexity without benefit.
2. The model must reply in **JSON**: `found`, `answer`, `sources` (doc ids) and `quotes` (exact sentences from those docs). Temperature is 0.
3. **Grounding check** (`src/helpdesk.js`): every quote must actually appear in a cited document, and every cited id must exist. If not, the answer is thrown away and the member gets the "not in the documents, contact support" message. A made-up answer never reaches the member, even if the model ignores the prompt.
4. **Failures** (`src/llm.js`): no connection, timeout (20 s), bad key, unknown model, rate limit, provider error, empty or unreadable reply each map to a plain message. The web API returns HTTP 503 for these.
5. **One retry** for rate-limit and 5xx replies after a 1 s pause. The free Gemini tier returned intermittent 500s during testing; one retry fixed most of them. Timeouts and bad keys are not retried.

Tested with `gemini-3.5-flash-lite` (free Google AI Studio tier). `gemini-2.5-flash` is closed to new keys, and the larger 3.x flash models were overloaded or timing out at the time of testing.

```
cli.js / server.js  ->  src/helpdesk.js (prompt, JSON parse, grounding check)
                         -> src/llm.js   (OpenAI-compatible call, timeout, error mapping)
                         -> src/documents.js (loads docs/*.md)
```

## Files

| Path | What |
| --- | --- |
| `docs/` | The three supplied fictional documents, unchanged |
| `src/helpdesk.js` | Prompt, JSON parsing, grounding check |
| `src/llm.js` | Model client and error handling |
| `cli.js`, `server.js`, `public/index.html` | Command line and web page |
| `test/` | Offline tests |
| `scripts/run-cases.js` | Runs the three required cases, saves to `results/` |

## What I would improve

- **Quote checking is exact-match.** A correct answer whose quote the model paraphrases slightly is rejected as "not found". That is the safe direction, but next I would match at sentence level with a small similarity tolerance and log rejections to measure how often it happens.
- **Scale.** With hundreds of documents, sending everything stops working; I would add chunking plus embedding search, and keep the same quote-grounding check on the retrieved chunks.
- **An evaluation set.** A fixed list of ~30 questions with expected sources (answerable, unanswerable, trick questions like "send me your password") run on every prompt or model change.
- **Phrasing of rule lines.** Asked "Can you check my account if I send you my password?", the lite model correctly refuses and points to support, but repeats the staff rule "Never ask a member to send a password" word for word. A prompt instruction did not fix it on the lite model; I would mark rule lines in the documents (e.g. a `Rule:` prefix) and exclude them from what may be quoted to members, or use a stronger model.
