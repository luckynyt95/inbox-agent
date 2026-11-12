"""Inbox Agent — Netlify serverless entrypoint.

Wraps the FastAPI app from inbox_app.py with Mangum so it runs as a
Netlify Function (AWS Lambda). One function serves the whole API:
POST /api/run, GET /api/status, /api/emails, /api/tasks, /api/drafts/*.

Notes:
- The app's data is the seeded FICTIONAL inbox in data/emails.json.
  Nothing touches a real mailbox; nothing is ever sent or deleted.
- llm.py stays inert without a GROQ_API_KEY env var (no key is set).
- No Gradio / @spaces.GPU code anywhere in this build.

Two Netlify-specific details, both handled here:
1. Path prefix: Netlify rewrites /api/* to /.netlify/functions/api/*,
   so the Lambda event's path can arrive WITH the function prefix.
   The middleware below strips a leading /.netlify/functions/<name>
   prefix so FastAPI always sees the plain /api/... path. If the
   event already carries the plain path, it passes through untouched.
2. Startup: FastAPI's @app.on_event("startup") runs the pipeline, but
   Mangum's lifespan handling can race the first request on Lambda.
   The pipeline is therefore also run eagerly at import (once per
   cold start), so STATE is populated before any request is handled.
   Re-running it is cheap and deterministic.
"""

import os
import re
import sys

# Make sure sibling modules (inbox_app, engine, llm) import, whatever
# sys.path the Lambda runtime starts with.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from mangum import Mangum  # noqa: E402

import inbox_app  # noqa: E402

_FUNCTION_PREFIX_RE = re.compile(r"^/\.netlify/functions/[^/]+")


class NetlifyPathMiddleware:
    """Strip Netlify's /.netlify/functions/<name> prefix, if present."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            stripped = _FUNCTION_PREFIX_RE.sub("", path, count=1)
            if stripped != path:
                scope["path"] = stripped or "/"
                scope["raw_path"] = scope["path"].encode("utf-8")
        await self.app(scope, receive, send)


# Run the pipeline once at import so the API has results even if the
# lifespan startup event hasn't fired yet on this container.
inbox_app.do_run()

app = NetlifyPathMiddleware(inbox_app.app)
handler = Mangum(app)
