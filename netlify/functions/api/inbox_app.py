"""Inbox Agent — FastAPI backend.

Serves the dashboard and the agent API. All data is the seeded
FICTIONAL inbox in data/emails.json. Nothing here touches a real
mailbox, and nothing is ever sent, forwarded, trashed or deleted.

Endpoints:
  GET  /                  -> dashboard
  GET  /api/status        -> engine mode (deterministic / groq)
  POST /api/run           -> run the agent pipeline
  GET  /api/emails        -> all emails with triage results
  GET  /api/emails/{id}   -> one email with triage results
  GET  /api/tasks         -> extracted task list
  POST /api/drafts/{id}/approve -> mark a draft approved (local only)
  POST /api/drafts/{id}/edit    -> edit a draft's text (local only)
"""

import json
import os
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import engine
import llm

BASE = Path(__file__).parent
DATA_FILE = BASE / "data" / "emails.json"

app = FastAPI(title="Inbox Agent")
app.mount("/static", StaticFiles(directory=BASE / "static"), name="static")

# In-memory state. Restarting the server resets everything — by design.
STATE = {"run": None, "approved": {}, "edited_drafts": {}, "last_run_seconds": None}


def load_emails():
    with open(DATA_FILE, encoding="utf-8") as f:
        return json.load(f)["emails"]


def do_run():
    """Run the pipeline once and stamp it with engine info."""
    start = time.time()
    emails = load_emails()
    result = engine.run_pipeline(emails)
    # Optional LLM polish: only rewrites draft WORDING, never decisions.
    if llm.available():
        for r in result["results"]:
            if r["draft"]:
                polished = llm.polish_draft(r["draft"], r["subject"])
                if polished:
                    r["draft"] = polished
                    r["draft_reason"] += " Wording polished by Groq (gpt-oss-20b)."
    STATE["run"] = result
    STATE["last_run_seconds"] = round(time.time() - start, 2)
    return result


@app.on_event("startup")
def startup():
    do_run()  # dashboard opens with results already in place


@app.get("/")
def home():
    return FileResponse(BASE / "static" / "index.html")


@app.get("/api/status")
def status():
    return {
        "engine": "groq (gpt-oss-20b) + deterministic rules" if llm.available()
                  else "deterministic rules only (no GROQ_API_KEY set)",
        "llm_available": llm.available(),
        "total_emails": STATE["run"]["total"] if STATE["run"] else 0,
        "last_run_seconds": STATE["last_run_seconds"],
        "note": "Demo data only — fictional inbox. Nothing is sent or deleted.",
    }


@app.post("/api/run")
def run():
    result = do_run()
    return {
        "counts": result["counts"],
        "total": result["total"],
        "drafts_written": result["drafts_written"],
        "tasks_found": len(result["tasks"]),
        "needs_you_now": result["needs_you_now"],
        "seconds": STATE["last_run_seconds"],
        "engine": "groq" if llm.available() else "deterministic",
    }


@app.get("/api/emails")
def list_emails(category: str = ""):
    results = STATE["run"]["results"]
    if category:
        results = [r for r in results if r["category"] == category]
    return {"emails": results, "counts": STATE["run"]["counts"]}


@app.get("/api/emails/{email_id}")
def get_email(email_id: str):
    for r in STATE["run"]["results"]:
        if r["id"] == email_id:
            out = dict(r)
            if email_id in STATE["edited_drafts"]:
                out["draft"] = STATE["edited_drafts"][email_id]
            out["approved"] = STATE["approved"].get(email_id, False)
            return out
    raise HTTPException(status_code=404, detail="email not found")


@app.get("/api/tasks")
def list_tasks():
    return {"tasks": STATE["run"]["tasks"], "count": len(STATE["run"]["tasks"])}


class DraftEdit(BaseModel):
    text: str


@app.post("/api/drafts/{email_id}/approve")
def approve_draft(email_id: str):
    STATE["approved"][email_id] = True
    return {"id": email_id, "approved": True,
            "note": "Local state only — nothing was sent."}


@app.post("/api/drafts/{email_id}/edit")
def edit_draft(email_id: str, body: DraftEdit):
    STATE["edited_drafts"][email_id] = body.text
    return {"id": email_id, "edited": True,
            "note": "Local state only — nothing was sent."}
