"""Optional LLM layer (Groq) — never required, never blocks the demo.

If the env var GROQ_API_KEY is set, draft wording is polished by
Groq's OpenAI-compatible chat endpoint (model openai/gpt-oss-20b).
If there is no key, or the call fails for any reason, the caller
just uses the deterministic draft from engine.py instead.

Rules: only the Python standard library is used here (urllib),
so this file adds no new dependency. OpenAI is never called.
"""

import json
import os
import urllib.request

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
MODEL = "openai/gpt-oss-20b"


def available():
    """True only when a Groq key is present in the environment."""
    return bool(os.environ.get("GROQ_API_KEY"))


def polish_draft(draft_text, email_subject):
    """Ask Groq to tighten a draft. Returns polished text, or None
    (caller keeps the deterministic draft) on any failure."""
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        return None
    payload = json.dumps({
        "model": MODEL,
        "messages": [
            {"role": "system", "content": (
                "You polish short email reply drafts. Keep it under 60 words, "
                "polite, plain English. Do not add facts, dates, amounts or "
                "promises that are not in the draft. Return only the draft."
            )},
            {"role": "user", "content": (
                f"Subject: {email_subject}\nDraft:\n{draft_text}"
            )},
        ],
        "temperature": 0.3,
        "max_tokens": 200,
    }).encode("utf-8")
    req = urllib.request.Request(
        GROQ_URL, data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.load(resp)
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        return None  # any failure -> deterministic draft stays
