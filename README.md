# Inbox Agent — agentic AI email automation (hackathon prototype)

**What it is:** five small agents read a messy inbox and do the boring
work — triage every email, score urgency, draft replies, pull out
tasks with due dates, and surface only the urgent ones for a human.
Drafts are drafts only: **nothing is ever sent, forwarded, trashed or
deleted.** All data is a seeded fictional inbox — no real mailbox is
touched.

## Run it (one command)

```bash
./run.sh
```

Then open **http://localhost:8000**. First run creates a virtual
environment and installs FastAPI + Uvicorn automatically.

Optional: set `GROQ_API_KEY` before starting to let Groq
(`openai/gpt-oss-20b`) polish draft wording. Without a key the app
runs fully on its deterministic rule engine and says so on screen.
OpenAI is never called.

## The five agents

1. **Triage Agent** — classifies each email: urgent / action / fyi /
   promo / spam, with a one-line reason. Spam (prize/bank-verify
   scams) is flagged and never acted on.
2. **Priority Agent** — scores urgency 1–5 with a reason.
3. **Draft Agent** — writes a short reply draft where a reply is
   genuinely expected (confirmations, approvals, outage reports).
   Approve/Edit buttons only mark state locally.
4. **Task Agent** — extracts tasks + due dates + owners from email
   bodies (dates are parsed from the text, e.g. "15 Nov", "tomorrow").
5. **Escalation** — urgent items appear in a "Needs you now" panel.

## API

| Method | Endpoint | What it does |
|---|---|---|
| GET | `/` | Dashboard |
| GET | `/api/status` | Engine mode (deterministic / groq) |
| POST | `/api/run` | Run the pipeline, returns counts |
| GET | `/api/emails` | All emails with triage results (`?category=urgent` to filter) |
| GET | `/api/emails/{id}` | One email |
| GET | `/api/tasks` | Task list |
| POST | `/api/drafts/{id}/approve` | Mark draft approved (local only) |
| POST | `/api/drafts/{id}/edit` | Edit draft text (local only) |

## Demo numbers (seeded fictional inbox, 20 emails)

- 3 urgent, 7 action, 5 FYI, 3 promo, 2 spam
- 6 reply drafts written, 10 tasks extracted with due dates
- Time saved on the dashboard is an **estimate**: it assumes ~3 min
  per email to read, sort and reply by hand (20 emails ≈ 60 min).

## Files

- `app.py` — FastAPI backend + endpoints
- `engine.py` — the deterministic agent rules (readable, judge-friendly)
- `llm.py` — optional Groq polish layer (stdlib only)
- `data/emails.json` — 20 fictional demo emails (labelled as such)
- `static/index.html` — colourful dashboard with animated counters
- `requirements.txt`, `run.sh` — setup and one-command start

## Guardrails

- Seeded fictional data only. No Gmail, no credentials, no sending.
- No PPT/deck is generated here (hackathon rules forbid AI PPT
  generation) — prototype only.
- No invented statistics: every demo number is labelled demo/estimate.
