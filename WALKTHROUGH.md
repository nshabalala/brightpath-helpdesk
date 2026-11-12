# Walkthrough

## What works

- Ask a question from the command line (`npm run ask -- "..."`) or a web page (`npm start`) with example questions, labelled answers, clickable sources that open the document with the supporting lines highlighted, a Try again button on failures, and phone and dark-mode layouts.
- Answers come only from the three supplied documents. Each answer shows the supporting document and the exact sentences it relied on.
- **Grounding check:** the model must return verbatim quotes, and the code checks every quote really appears in a cited document. If it does not, the answer is discarded and the member is told the information is not available. So an invented answer cannot reach the member even if the model ignores its instructions. (Unit-tested with a fabricated "refunds within 30 days" answer.)
- Questions the documents do not answer (pricing, refunds, job placement) get a clear "not in the documents, contact support" reply.
- Model failures (no connection, timeout, bad key, unknown model, rate limit, provider error, unreadable reply) each give a plain message. Busy/5xx replies get one retry.
- Safety and cost: a typed password is answered locally and never sent to the AI; questions and replies are size-capped; repeated questions reuse the earlier answer; the web API is limited to 10 questions a minute per visitor and only listens on this machine.
- 18 offline tests (`npm test`) plus a real failure demo (`npm run fail-demo`).

## Three test results (real model: gemini-3.5-flash-lite)

Full output in `results/results.md`.

1. **Supported:** "When is the group coaching session, and where do I find the link?"
   → "Tuesday at 16:00 UTC, link on the Coaching page 30 minutes before." Source: Document 2, with both quoted sentences. (~1.7 s)
2. **Unknown:** "How much does the Foundations course cost, and can I get a refund?"
   → "I can't find that in the BrightPath help documents. Please contact support@brightpath.example (Mon–Fri, 09:00–17:00 UTC)."
3. **API failure:** model URL pointed at a closed port.
   → "The AI model is unavailable right now (could not connect). Please try again shortly." Web API returns 503.

## What I built myself

I directed the build with Claude Code, an AI coding agent: I set the goal and the constraints, chose and set up the model, and reviewed the results and the code. The safety and cost guards come from engineering rules I apply to my own production apps: never send a secret to a third party, cap every AI call, reuse identical answers, and never show internal diagnostics to users. Claude Code proposed the detailed design (whole-document context, strict JSON output, the quote-grounding check, error mapping, single retry), wrote most of the code and tests, and ran them against the real model. Every result above comes from those runs and is saved in `results/`. I can walk through how each part works.

## Problems found while testing

- `gemini-2.5-flash` returned 404 ("no longer available to new users"). The app's message for that was vague, so I added a specific "model not found, check LLM_MODEL" message.
- The bigger Gemini 3.x flash models timed out or returned "high demand" on the free tier; I switched to the lite model, which answered in 1 to 7 s.
- The free tier returned occasional 500s, so I added one retry for 429/5xx only.

## What I would improve

Rule lines get quoted to members: asked "Can you check my account if I send you my password?", the model refuses correctly and points to support, but repeats the staff rule "Never ask a member to send a password" verbatim. A prompt instruction did not fix it on the lite model. Next step: tag rule lines in the documents and exclude them from member-facing quotes, then add this question to a small fixed evaluation set (answerable, unanswerable and trick questions) run on every prompt or model change.

## Time spent

About 30 minutes of build time, plus a few minutes setting up a free model key.

## Tools used

- **Claude Code** (AI coding agent, Claude Opus model): proposed the detailed design, wrote most of the code and tests, ran them, and drove the browser checks of the web page.
- **Google AI Studio, `gemini-3.5-flash-lite`** (free tier): the model that answers questions. Any OpenAI-compatible endpoint works by changing `.env`.
- **Node.js 22 built-ins only:** `http`, `fetch`, `node:test`. No npm libraries, templates or UI kits.

## Unfinished or limited

- The model sometimes repeats internal rule lines word for word (see "What I would improve").
- Quote checking is exact-match, so a correct answer with a slightly paraphrased quote is shown as "not found". That is the safe direction, but it can hide good answers.
- All three documents are sent with every question. Fine for three short documents; it would need search over chunks to scale.
- No hosted demo: it runs locally with your own free key (see README). The reviewer needs a key to see real answers; `npm test` and `npm run fail-demo` work without one.
- The rate limit and answer cache live in memory, so they reset when the server restarts. Fine for one local process.
- Assumption: questions are in English.
