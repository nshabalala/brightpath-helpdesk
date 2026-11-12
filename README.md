# BrightPath Help Desk

Answers member questions only from the three supplied BrightPath documents, shows the supporting document, says so when the answer isn't there, and gives a clear message when the model is unavailable. Node 22+, no dependencies.

## Run it

```bash
cp .env.example .env                       # add a free key (Google AI Studio), or point at a local model
npm run ask -- "When is group coaching?"   # command line
npm start                                  # web page on http://localhost:8790
```

Any OpenAI-compatible endpoint works (Gemini, Groq, Ollama). Keys live only in `.env`.

## Test it

```bash
npm test           # 18 offline tests, no key needed
npm run fail-demo  # a real API failure (model URL pointed at a closed port), no key needed
npm run cases      # the three required cases on the real model, saved to results/
```

## How it works

- All three documents go to the model with each question. The model must reply in JSON with its answer, the document ids it used, and exact quotes.
- **Grounding check:** every quote must really appear in a cited document, or the answer is discarded and the member is told it isn't in the documents. A made-up answer can't reach the member.
- **Failures** (no connection, timeout, bad key, rate limit, provider error, unreadable reply) each give a plain message; busy or server errors get one retry.
- **Guards:** a typed password is never sent to the AI; questions and replies are size-capped; repeated questions reuse the earlier answer; the web API allows 10 questions a minute per visitor and listens on this machine only.

Main code: `src/helpdesk.js` (prompt, grounding check) and `src/llm.js` (model call, errors). Tested with `gemini-3.5-flash-lite`. Walkthrough and improvements: [WALKTHROUGH.md](WALKTHROUGH.md).
