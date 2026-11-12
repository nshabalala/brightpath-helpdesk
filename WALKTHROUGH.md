# Walkthrough

## What works

- Ask from the command line or a help-centre web page: guides on the left, chat on the right. Answers come only from the three documents; tapping the source highlights the exact lines used. Each answer shows its response time, and a slow model shows a "slower than usual" notice and then a Cancel button.
- **Grounding check:** every quote the model gives must really appear in the cited document, or the answer is discarded and the member is told it isn't in the documents. An invented answer can't get through, even if the model ignores its instructions.
- Model failures give a plain message (connection, timeout, bad or missing key, rate limit, provider error), with one retry for busy or server errors.
- A typed password is never sent to the AI. AI calls are size-capped, repeated questions reuse the answer, and the web API is rate-limited.
- 19 offline tests, plus `npm run fail-demo` for a real failure.

## Three test results (gemini-3.5-flash-lite, saved in `results/`)

1. **Supported:** "When is the group coaching session, and where do I find the link?" Answer: "Tuesdays at 16:00 UTC; the link appears on the Coaching page 30 minutes before." Source: Document 2, with both sentences quoted.
2. **Unknown:** "How much does the Foundations course cost, and can I get a refund?" Answer: "I can't find that in the BrightPath help documents. Please contact support@brightpath.example (Monday to Friday, 09:00 to 17:00 UTC)."
3. **API failure:** model URL pointed at a closed port. Answer: "The AI model is unavailable right now (could not connect). Please try again shortly." (HTTP 503 from the web API.)

## What I built myself

I directed the build with Claude Code, an AI coding agent. I set the goal and constraints, chose and set up the model, and reviewed the results and code. The safety and cost guards come from rules I apply to my own production apps: no secrets to third parties, cap every AI call, reuse identical answers, no internal diagnostics shown to users. Claude Code proposed the detailed design, wrote most of the code and tests, and ran them against the real model.

## What I would improve

Asked "Can you check my account if I send you my password?", the model correctly refuses and points to support, but repeats the staff rule "Never ask a member to send a password" word for word. A prompt change didn't fix it on the lite model. Next I would tag rule lines in the documents, keep them out of member-facing answers, and add this question to a small fixed test set run on every prompt or model change.

## Time spent

About 40 minutes, including a second pass on the web page.

## Tools used

- **Claude Code** (AI coding agent): design, most of the code and tests, test runs and browser checks.
- **Google AI Studio, gemini-3.5-flash-lite** (free tier): the answering model.
- **Node.js 22 built-ins only.** No libraries, templates or UI kits.

## Unfinished or limited

- Rule lines can be repeated to members (above).
- Quote checking is exact-match, so a correct answer with a slightly reworded quote shows as "not found". That's the safe direction, but it can hide good answers.
- All documents go to the model with each question. That's fine for three, but it would need search to scale.
- No hosted demo. It runs locally with your own free key; the tests and failure demo need no key.
- The rate limit and cache are in memory and reset on restart.
- Problems hit while building: `gemini-2.5-flash` is closed to new keys, and the larger free models were overloaded, so I used the lite model and added the retry.
