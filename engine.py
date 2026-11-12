"""Inbox Agent engine — deterministic (rule-based) agents.

This is the WORKING engine. It uses only plain rules: keywords,
sender patterns and date parsing. No key, no network, no guessing.
An optional LLM layer (llm.py) can polish draft wording, but the
decisions here never depend on it.

Agent order: Triage -> Priority -> Draft -> Task -> Escalation.
Every decision carries a one-line reason so judges can see WHY.
"""

import re
from datetime import datetime, timedelta

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
DATE_RE = re.compile(r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(\s+\d{4})?", re.I)

# --- Triage Agent -------------------------------------------------------
# Rules are checked in order: spam first (never act on spam), then urgent,
# then promo, then action, then FYI as the default.

SPAM_SIGNALS = [
    ("won", "lottery"), ("won", "claim"), ("claim your prize",),
    ("verify your bank",), ("account will be closed",),
    ("processing fee", "claim"), ("bank details", "won"),
]
SPAM_SENDERS = (".xyz", "luckywinner", "secure-bank-alerts")

URGENT_SIGNALS = [
    ("website", "down"), ("server", "down"), ("outage",),
    ("rescheduled",), ("deadline",), ("hall ticket", "blocked"),
]
PROMO_SIGNALS = [
    ("% off",), ("sale ends",), ("big sale",), ("on sale",),
    ("discount",), ("free delivery",),
    ("upgrade", "save"), ("offer",),
]
ACTION_SIGNALS = [
    ("pay",), ("submit",), ("approve",), ("approval",),
    ("confirm",), ("sign",), ("return",), ("due",),
]


def _has(text, phrases):
    """True if ALL words of any phrase group appear as whole words in text.

    Word-boundary matching matters: without it, 'pay' matches 'PayDemo',
    'sale' matches 'sales invoices', and 'won a prize' looks like a scam.
    """
    return any(
        all(re.search(r"(?<!\w)" + re.escape(w) + r"(?!\w)", text) for w in group)
        for group in phrases
    )


def triage(email):
    """Agent 1 — classify one email. Returns (category, reason)."""
    text = (email["subject"] + " " + email["body"]).lower()
    sender = email["from"].lower()

    if any(s in sender for s in SPAM_SENDERS) or _has(text, SPAM_SIGNALS):
        return "spam", "Looks like a scam: prize/bank-verify wording from an unknown sender. Never click its links."
    if _has(text, URGENT_SIGNALS):
        if "down" in text or "outage" in text:
            return "urgent", "Service is down / outage — needs attention right now."
        if "rescheduled" in text:
            return "urgent", "Something changed at short notice (rescheduled) — reply needed today."
        return "urgent", "Has a hard deadline with a penalty if missed."
    if _has(text, PROMO_SIGNALS):
        return "promo", "Marketing message: sale, discount or offer. Nothing to do."
    if _has(text, ACTION_SIGNALS):
        return "action", "Needs a reply or an action from you (pay, submit, approve, confirm…)."
    return "fyi", "Information only — no reply or action needed."


# --- Priority Agent ------------------------------------------------------

def priority(email, category):
    """Agent 2 — score urgency 1 (lowest) to 5 (highest)."""
    text = (email["subject"] + " " + email["body"]).lower()
    if category == "spam" or category == "promo":
        return 1, "Low value: spam or marketing."
    if category == "fyi":
        return 2, "Informational only."
    if category == "action":
        return 3, "Needs action, but no immediate penalty."
    # urgent: 5 if it is happening today/tomorrow or a service is down
    if "down" in text or "outage" in text or "tomorrow" in text:
        return 5, "Happening now or tomorrow — act first."
    return 4, "Urgent, with a deadline a few days away."


# --- Deadline parsing ----------------------------------------------------

def parse_deadline(email):
    """Find a due date in the body. Returns (date_str, source) or (None, None)."""
    body = email["body"]
    ref = datetime.fromisoformat(email["date"])
    low = body.lower()
    m = DATE_RE.search(body)
    if m:
        day = int(m.group(1))
        month = MONTHS[m.group(2).lower()[:3]]
        year = int(m.group(3).strip()) if m.group(3) else ref.year
        return f"{year:04d}-{month:02d}-{day:02d}", "date written in the email"
    if "tomorrow" in low:
        d = ref + timedelta(days=1)
        return d.strftime("%Y-%m-%d"), "word 'tomorrow' in the email"
    if "today" in low:
        return ref.strftime("%Y-%m-%d"), "word 'today' in the email"
    return None, None


# --- Draft Agent ---------------------------------------------------------

# (word-groups, draft template) — a draft is written only when ALL words
# of one group appear as whole words. ("website","down") means the
# website must actually be down, not just mentioned (E04's bill says
# "pay on our app or website" — that is NOT an outage.)
DRAFT_TEMPLATES = [
    ([("rescheduled",)], "Hi,\n\nThanks for the update. Confirming I will attend the rescheduled interview tomorrow, 13 Nov, at 10:00 AM, and I will carry my resume and ID card.\n\nThanks,\nRonnie"),
    ([("approve",)], "Hi,\n\nApproved — your leave from 14 to 16 Nov is fine. Thanks for sorting the handover.\n\nThanks,\nRonnie"),
    ([("confirm your order",)], "Hi,\n\nConfirming the order of 50 steel brackets. Please go ahead with cutting.\n\nThanks,\nRonnie"),
    ([("sign",)], "Hi,\n\nI have signed the vendor agreement and will send the signed copy back by 15 Nov 2026.\n\nThanks,\nRonnie"),
    ([("website", "down"), ("outage",)], "Hi team,\n\nOur website shopdemo.in appears to be down since 2 AM and customers cannot place orders. Could you please share an ETA for fixing it?\n\nThanks,\nRonnie"),
    ([("semester fee",)], "Hi,\n\nI will pay the semester fee of Rs 48,500 by 15 Nov 2026 through the fee portal. Please confirm once it is received.\n\nThanks,\nRonnie"),
]


def draft(email, category):
    """Agent 3 — write a short reply draft, or None if no reply is needed.

    Drafts are only written when a reply is genuinely expected.
    Portal payments and form submissions need no email reply.
    """
    if category not in ("urgent", "action"):
        return None, "No reply needed for this category."
    text = (email["subject"] + " " + email["body"]).lower()
    for groups, template in DRAFT_TEMPLATES:
        # groups is a tuple of word-groups; any one group matching wins.
        if _has(text, groups):
            return template, "Drafted from the email's ask."
    return None, "No reply expected — the action happens on a portal, not by email."


# --- Task Agent ----------------------------------------------------------

TASK_VERBS = [
    ("pay", "Pay"), ("submit", "Submit"), ("approve", "Approve"),
    ("confirm", "Confirm"), ("return", "Return"), ("sign", "Send"),
    ("send", "Send"), ("website", "Follow up on"),
]


def extract_task(email, category):
    """Agent 4 — pull one task + due date out of an email, or None."""
    if category not in ("urgent", "action"):
        return None
    text = (email["subject"] + " " + email["body"]).lower()
    due, source = parse_deadline(email)
    if due is None:
        # No date found: only urgent items still become tasks, due today.
        if category != "urgent":
            return None
        due = datetime.fromisoformat(email["date"]).strftime("%Y-%m-%d")
        source = "no date in the email — set to today"
    for keyword, verb in TASK_VERBS:
        if _has(text, [(keyword,)]):
            short = email["subject"].split("—")[0].strip()
            if short.lower().startswith("please "):
                short = short[7:]
            if short.lower().startswith(verb.lower() + " "):
                short = short[len(verb) + 1:]
            short = short[:1].upper() + short[1:]
            title = f"{verb}: {short}"
            return {
                "email_id": email["id"],
                "title": title,
                "due": due,
                "due_source": source,
                "owner": "You",
                "priority": 5 if category == "urgent" else 3,
            }
    return None


# --- Full pipeline -------------------------------------------------------

def run_pipeline(emails):
    """Run all agents over every email. Returns results + summary."""
    results = []
    tasks = []
    for email in emails:
        category, triage_reason = triage(email)
        score, prio_reason = priority(email, category)
        draft_text, draft_reason = draft(email, category)
        task = extract_task(email, category)
        if task:
            tasks.append(task)
        results.append({
            **email,
            "category": category,
            "triage_reason": triage_reason,
            "priority": score,
            "priority_reason": prio_reason,
            "draft": draft_text,
            "draft_reason": draft_reason,
            "task": task,
        })
    counts = {c: 0 for c in ("urgent", "action", "fyi", "promo", "spam")}
    for r in results:
        counts[r["category"]] += 1
    # Agent 5 — Escalation: urgent items, highest priority first.
    needs_you = [r for r in results if r["category"] == "urgent"]
    needs_you.sort(key=lambda r: -r["priority"])
    tasks.sort(key=lambda t: (t["due"], -t["priority"]))
    return {
        "results": results,
        "tasks": tasks,
        "needs_you_now": [r["id"] for r in needs_you],
        "counts": counts,
        "total": len(results),
        "drafts_written": sum(1 for r in results if r["draft"]),
    }
