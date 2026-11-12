# BrightPath Help Desk

A small AI help desk that answers questions only from the three supplied BrightPath documents, shows which document supports each answer, says so when the answer isn't there, and gives a clear message when the AI model is unavailable.

![Help centre with guides on the left and the help desk chat on the right](screenshot.png)

## What you need to install

- **Node.js 22 or newer.** Download it from [nodejs.org](https://nodejs.org) (the LTS version is fine). Check with `node -v`.
- **Nothing else.** There are no npm packages, so there is no `npm install` step.
- **A free AI key** to get real answers: create one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey) (Google account, no card). Without a key the app still opens, shows the guides, and says it is waiting for the host to connect a working AI model.

## Open the app

1. **Get the code.** Either `git clone https://github.com/nshabalala/brightpath-helpdesk.git`, or on GitHub press **Code, Download ZIP** and unzip it.
2. **Open a terminal in the folder:**
   ```bash
   cd brightpath-helpdesk
   ```
3. **Create your settings file** from the example:
   - Mac or Linux: `cp .env.example .env`
   - Windows (Command Prompt): `copy .env.example .env`
4. **Add your key.** Open `.env` in any text editor and paste your key after `LLM_API_KEY=` (no spaces or quotes). Save it. Leave the other lines as they are.
5. **Start it:**
   ```bash
   npm start
   ```
6. **Open [http://127.0.0.1:8790](http://127.0.0.1:8790)** in your browser. Ask a question in the chat on the right, or tap one of the suggested questions.

To stop it, press `Ctrl+C` in the terminal. If you change `.env`, stop and start it again.

**Command line instead of the web page:** `npm run ask -- "When is group coaching?"`

## Test it (no key needed)

```bash
npm test           # 21 automatic tests
npm run fail-demo  # a real AI failure (model address pointed at a closed port)
npm run cases      # with a key: the three required cases, saved to results/
```

## If something goes wrong

The app tells you what to do in the terminal when it starts and on the page:

| What you see | What to do |
| --- | --- |
| "waiting for the host to connect a working AI model" | Follow the "For the host" box on the page or the line in the terminal: usually add or fix `LLM_API_KEY` in `.env`, then restart. |
| "port 8790 is already in use" | Start on another port, e.g. `PORT=8791 npm start` (Windows: `set PORT=8791 && npm start`), and open that port instead. |
| "Node.js 22 or newer is needed" | Install the current LTS from nodejs.org. |
| "The AI model is slower than usual" or "try again" | The free AI tier is busy; wait a moment and try again. |

## How it works

- All three documents go to the model with each question. The model must reply in JSON with its answer, the document ids it used and exact quotes.
- **Grounding check:** every quote must really appear in a cited document, or the answer is discarded and the member is told it isn't in the documents. A made-up answer can't reach the member.
- **Fail-safes:** setup problems (no key, wrong key, wrong model) show "waiting for the host" to members and the exact fix to the host only; temporary problems (slow, busy, down) show "try again" with one automatic retry; offline, a busy port, an old Node version and missing documents each get a clear message.
- **Guards:** a typed password is never sent to the AI; questions and replies are size-capped; repeated questions reuse the earlier answer; the web page allows 10 questions a minute per visitor and is only reachable from this computer.
- **Web page:** guides on the left built from the same documents; tapping an answer's source highlights the lines it came from; each answer shows its response time; works on phones, tablets and desktops, light and dark.

Any OpenAI-compatible model works by changing `.env` (Gemini, Groq, or a local Ollama model, which needs no key). Tested with `gemini-3.5-flash-lite`.

Main code: `src/helpdesk.js` (prompt, grounding check), `src/llm.js` (model call), `src/failures.js` (fail-safe messages), `server.js` (web server). Walkthrough and test results: [WALKTHROUGH.md](WALKTHROUGH.md), [results/results.md](results/results.md).
