# BrightPath Help Desk

A small AI help desk that answers member questions **only** from the three supplied BrightPath documents, shows which document supports each answer, says so when the answer is not there, and gives a clear message when the model is unavailable.

No dependencies. Node 22+ only.

## Run it

```bash
cp .env.example .env        # then add a free key, e.g. Google AI Studio
npm run ask -- "When is group coaching?"     # one question
npm run ask                                   # interactive
npm start                                     # web page on http://localhost:8790 (this machine only)
```

Any OpenAI-compatible endpoint works (Gemini via AI Studio, Groq, Ollama, LM Studio). Configuration is read from `.env` / environment only; no keys are in the code.

## Tests

```bash
npm test          # offline logic tests (model replaced by a stub)
npm run fail-demo # real API failure: points the model URL at a closed port (no key needed)
npm run cases     # the three required cases against the real model -> results/
```

`npm test` (17 tests) covers: verified answer, model says not found, invented quote rejected, unknown document id rejected, empty answer, connection failure, timeout, rate limit, bad key, missing config, unreadable / cut-off / non-JSON reply, one retry then success, bad key not retried, typed password never sent, empty and over-long questions, cache reuse, errors not cached.

The real-model results are in [`results/results.md`](results/results.md).

## How it works

1. **All three documents go to the model** with each question, each tagged with an id (`doc1`, `doc2`, `doc3`). They are tiny, so retrieval would add complexity without benefit.
2. The model must reply in **JSON**: `found`, `answer`, `sources` (doc ids) and `quotes` (exact sentences from those docs). Temperature is 0.
3. **Grounding check** (`src/helpdesk.js`): every quote must actually appear in a cited document, and every cited id must exist. If not, the answer is thrown away and the member gets the "not in the documents, contact support" message. A made-up answer never reaches the member, even if the model ignores the prompt.
4. **Failures** (`src/llm.js`): no connection, timeout (20 s), bad key, unknown model, rate limit, provider error, empty or unreadable reply each map to a plain message. The web API returns HTTP 503 for these.
5. **One retry** for rate-limit and 5xx replies after a 1 s pause. The free Gemini tier returned intermittent 500s during testing; one retry fixed most of them. Timeouts and bad keys are not retried.

6. **Passwords never leave the machine.** A question like "my password is ..." is answered locally (go to Forgot password) and never sent to the AI provider. The web page also masks it in the conversation.
7. **Cost guards.** Questions are capped at 500 characters and replies at 800 tokens. An identical question reuses the earlier answer from a small in-memory cache (errors are never cached). There is no sign-in (the brief says none is needed), so the web API limits each visitor to 10 questions a minute instead.
8. **Web API.** Listens on 127.0.0.1 only unless `HOST` is set. Status codes: 200 answered / not found, 400 bad question, 413 too long, 429 too many, 503 model unavailable, 500 unexpected. Internal diagnostics go to the server log (without the question text), never to the browser.

## The web page

- Example questions to start, a chat-style thread, and a "Checking the help documents..." state.
- Each answer is labelled: from the documents, not in the documents (with a support email link), check your question, or unavailable (with a Try again button).
- Source labels open the document with the supporting lines highlighted (a bottom sheet on phones).
- Works on phones, follows light/dark mode, keyboard friendly (Enter to send), screen reader announcements, respects reduced motion. Answers are inserted as text, never as HTML.

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
| `cli.js` | Command line |
| `server.js`, `public/index.html` | Web API and page |
| `test/` | Offline tests |
| `scripts/run-cases.js` | Runs the three required cases, saves to `results/` |

## What I would improve

- **Quote checking is exact-match.** A correct answer whose quote the model paraphrases slightly is rejected as "not found". That is the safe direction, but next I would match at sentence level with a small similarity tolerance and log rejections to measure how often it happens.
- **Scale.** With hundreds of documents, sending everything stops working; I would add chunking plus embedding search, and keep the same quote-grounding check on the retrieved chunks.
- **An evaluation set.** A fixed list of ~30 questions with expected sources (answerable, unanswerable, trick questions like "send me your password") run on every prompt or model change.
- **Phrasing of rule lines.** Asked "Can you check my account if I send you my password?", the lite model correctly refuses and points to support, but repeats the staff rule "Never ask a member to send a password" word for word. A prompt instruction did not fix it on the lite model; I would mark rule lines in the documents (e.g. a `Rule:` prefix) and exclude them from what may be quoted to members, or use a stronger model.
