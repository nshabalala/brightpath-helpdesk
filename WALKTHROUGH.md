# Walkthrough

## What works

- Ask a question from the command line (`npm run ask -- "..."`) or a small web page (`npm start`).
- Answers come only from the three supplied documents. Each answer shows the supporting document and the exact sentences it relied on.
- **Grounding check:** the model must return verbatim quotes, and the code checks every quote really appears in a cited document. If it does not, the answer is discarded and the member is told the information is not available. So an invented answer cannot reach the member even if the model ignores its instructions. (Unit-tested with a fabricated "refunds within 30 days" answer.)
- Questions the documents do not answer (pricing, refunds, job placement) get a clear "not in the documents, contact support" reply.
- Model failures (no connection, timeout, bad key, unknown model, rate limit, provider error, unreadable reply) each give a plain message. Busy/5xx replies get one retry.
- 11 offline tests (`npm test`) plus a real failure demo (`npm run fail-demo`).

## Three test results (real model: gemini-3.5-flash-lite)

Full output in `results/results.md`.

1. **Supported:** "When is the group coaching session, and where do I find the link?"
   → "Tuesday at 16:00 UTC, link on the Coaching page 30 minutes before." Source: Document 2, with both quoted sentences. (~1.7 s)
2. **Unknown:** "How much does the Foundations course cost, and can I get a refund?"
   → "I can't find that in the BrightPath help documents. Please contact support@brightpath.example (Mon–Fri, 09:00–17:00 UTC)."
3. **API failure:** model URL pointed at a closed port.
   → "The AI model is unavailable right now (could not connect). Please try again shortly." Web API returns 503.

## What I built myself

I designed the approach and directed the build: whole-document context instead of retrieval (the docs are tiny), strict JSON output, the quote-grounding check, the error mapping and the single retry. I used Claude Code to write most of the code and tests, then ran and checked every result against the real model myself, and I can walk through any line.

## Problems found while testing

- `gemini-2.5-flash` returned 404 ("no longer available to new users"). The app's message for that was vague, so I added a specific "model not found, check LLM_MODEL" message.
- The bigger Gemini 3.x flash models timed out or returned "high demand" on the free tier; I switched to the lite model, which answered in 1 to 7 s.
- The free tier returned occasional 500s, so I added one retry for 429/5xx only.

## What I would improve

Rule lines get quoted to members: asked "Can you check my account if I send you my password?", the model refuses correctly and points to support, but repeats the staff rule "Never ask a member to send a password" verbatim. A prompt instruction did not fix it on the lite model. Next step: tag rule lines in the documents and exclude them from member-facing quotes, then add this question to a small fixed evaluation set (answerable, unanswerable and trick questions) run on every prompt or model change.
