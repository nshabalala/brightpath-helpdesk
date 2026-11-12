# Test results

Model: `gemini-3.5-flash-lite`  
Ran at: 2026-11-12T07:47:58.362Z

## Supported question

**Question:** When is the group coaching session, and where do I find the link?  
**Status:** `answered` (4647 ms)

```
A group coaching session takes place every Tuesday at 16:00 UTC, and the link appears on the Coaching page 30 minutes before the session.

Source: Coaching and feedback (doc2)
  > A group coaching session takes place every Tuesday at 16:00 UTC.
  > The link appears on the Coaching page 30 minutes before the session.
```

## Unknown question

**Question:** How much does the Foundations course cost, and can I get a refund?  
**Status:** `not_found` (6868 ms)

```
I can't find that in the BrightPath help documents. Please contact support@brightpath.example (Monday to Friday, 09:00 to 17:00 UTC).
```

## API failure

**Question:** How do I reset my password?  
**Status:** `error` (2 ms)

```
The AI model can't be reached right now. Please try again in a moment.

Host: Could not connect to http://127.0.0.1:9/v1. Check LLM_BASE_URL and this machine's internet connection.
```
