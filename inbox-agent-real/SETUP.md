# Inbox Agent v1 — Setup Sheet (Real App)

A working product, not the seeded prototype. Any user signs in with Google
in the app; the backend runs the deterministic five-agent pipeline
(Triage → Priority → Draft → Task → Escalation) over their real Gmail.
Nothing is ever sent without the user approving AND confirming a draft;
nothing is ever deleted or forwarded. The prototype at
https://inbox-agent.netlify.app is untouched — this is a separate app.

## What is in this folder

- `netlify.toml` — publish `public`, functions `netlify/functions`, no build command.
- `public/` — `index.html`, `app.js`, `styles.css`. Professional SPA:
  white / warm-gray, one muted deep-green accent, system fonts, no
  gradients, no emoji, no AI branding. Connect Gmail, counts, Needs-you-now,
  filterable inbox, email detail with draft Approve / Edit / Approve & Send
  (explicit confirm step), tasks, reminder settings (frequency 1–5/day,
  hours picker, timezone, default Asia/Kolkata).
- `netlify/functions/api.mjs` — the whole backend, one plain-JS Netlify
  Functions v2 file (`config = { path: "/api/*" }`). Zero dependencies
  except `@netlify/blobs` (see `package.json`). Engine copied verbatim from
  the verified prototype; on the seed data it produces counts
  {urgent:3, action:7, fyi:5, promo:3, spam:2}, 6 drafts, 10 tasks,
  needs-you-now [E02, E03, E01].
- `package.json` / `package-lock.json` — only `@netlify/blobs`. Do NOT
  include `node_modules/` in the deploy (Netlify installs it).
- The GitHub Actions workflow is a SEPARATE file, NOT in this folder:
  `~/workspace/inbox-agent-real-workflow/reminders.yml` — it must be placed
  at `.github/workflows/reminders.yml` in the repo root.

## Step 1 — Google Cloud Console: OAuth client

Do this first in outline, but note the redirect URI needs the live site URL
(see Step 2) — you can create the client now and add the redirect URI after
the first deploy, then redeploy is NOT needed (redirect URIs are checked
live by Google).

1. Go to https://console.cloud.google.com/ and create a new project
   (any name, e.g. "Inbox Agent").
2. APIs & Services → Library → search "Gmail API" → Enable.
3. APIs & Services → OAuth consent screen:
   - User type: External.
   - Fill app name ("Inbox Agent"), user support email, developer contact email.
   - Scopes: add `https://www.googleapis.com/auth/gmail.readonly` and
     `https://www.googleapis.com/auth/gmail.send`.
   - Test users: add the Gmail address(es) that will sign in (in Testing
     mode, only listed test users can sign in, and refresh tokens expire
     after 7 days — see "Testing vs Production" below).
   - Save. Do NOT publish yet unless you want any Google user to be able
     to sign in (publishing requires Google verification for the
     `gmail.send` scope; for personal/family use, Testing mode + test users
     is the honest path).
4. APIs & Services → Credentials → Create Credentials → OAuth client ID →
   Application type: Web application. Name it "Inbox Agent web".
   - Authorized JavaScript origins: `https://<your-site>.netlify.app`
   - Authorized redirect URIs: `https://<your-site>.netlify.app/api/auth/callback`
   - Create. Copy the Client ID and Client secret into Step 3. Never commit
     them anywhere.

## Step 2 — Deploy to Netlify (recommended: Git import)

1. Push this folder to a GitHub repo. Either:
   - (a) Make this folder the repo root, or
   - (b) Put it in a repo as the `inbox-agent-real/` subfolder and set the
     Netlify **base directory** to `inbox-agent-real`.
   Also place `reminders.yml` at `.github/workflows/reminders.yml` in the
   same repo (see Step 4).
2. Netlify → Add new site → Import an existing project → GitHub → pick the
   repo. Build settings are read from `netlify.toml` (publish `public`,
   functions `netlify/functions`, no build command). Deploy.
3. The site URL will be `https://<name>.netlify.app`. Rename it to
   something clean (e.g. `inbox-agent-real`) in Site configuration →
   Site details → Change site name.
4. Go back to Google Cloud Console and add the real redirect URI from
   Step 1 (it must match the deployed URL exactly, including `https://`).

Alternative: Netlify Drop with the provided zip. It works for JS functions
when logged in, but Git import is the reliable path (Drop has already
failed to package a function once on this project) — verify `/api/status`
after any Drop deploy.

## Step 3 — Netlify environment variables

Site configuration → Environment variables (scope: all, or Production):

| Variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID from Step 1 |
| `GOOGLE_CLIENT_SECRET` | Client secret from Step 1 |
| `REMIND_SECRET` | A long random string — generate with `openssl rand -hex 32`. Use the SAME value as the GitHub repo secret in Step 4. |

Then trigger a redeploy (Deploys → Trigger deploy) so the function picks
the variables up. Never set `MOCK_GMAIL` in production — it is a local
verification switch only.

## Step 4 — Reminder workflow (GitHub Actions)

1. Copy `reminders.yml` to `.github/workflows/reminders.yml` in the repo.
2. In the file, replace `https://REPLACE-WITH-YOUR-NETLIFY-URL.netlify.app`
   with the real site URL (no trailing slash).
3. Repo → Settings → Secrets and variables → Actions → New repository
   secret: name `REMIND_SECRET`, value = the same string as the Netlify
   env var in Step 3.
4. It runs hourly (`0 * * * *`) and POSTs `/api/remind`. The endpoint
   itself decides per user whether the current hour matches their chosen
   hours and skips users already reminded that hour, so hourly calls are
   safe. You can also run it manually from the Actions tab
   (`workflow_dispatch`).

## Step 5 — What Ronnie does in the app

1. Open the site → **Connect Gmail** → sign in with any Google account →
   approve the two scopes (read mail, send mail). The app stores a refresh
   token (Netlify Blobs) so reminders work while he is away.
2. Click **Run the agents** — the pipeline runs over the last 50 inbox
   messages. Counts, Needs-you-now, inbox, tasks populate.
3. Open an email → read the draft → **Approve**, **Edit**, or
   **Approve & Send** (an inline confirm appears first; only then is a
   real email sent, as a reply in the same thread).
4. Settings → reminders: pick frequency (1–5/day), the exact hours
   (e.g. 09:00, 13:00, 18:00), timezone, enable. The digest email
   ("Inbox Agent: check your sorted mail") arrives at those hours with
   urgent count + tasks due.

## Security trade-offs (honest, v1 personal use)

- Refresh tokens are stored in Netlify Blobs, scoped to the site (Netlify
  encrypts Blobs at rest). Anyone with Netlify admin access to the site
  could read them — treat the Netlify account like the Gmail account.
- The session token lives in the browser's localStorage and is sent as a
  `Bearer` header. A malicious script injected into the page could steal
  it — the app loads no third-party scripts, fonts, or CDNs, which keeps
  that surface minimal, but a `httpOnly` cookie would be stronger; that is
  a v2 hardening item, not v1.
- `gmail.send` is used ONLY for (a) a draft the user approved AND
  confirmed in the UI, and (b) the reminder digest to the user themself.
  The app never deletes, forwards, or archives anything.
- Google OAuth consent screen in Testing mode: only listed test users can
  sign in and refresh tokens expire after 7 days (Google's testing-mode
  rule). If the app is for more people or longer-lived sessions, the
  consent screen must be published and the `gmail.send` scope verified
  by Google.
- No data leaves the user's Google account except to Netlify Blobs
  (tokens + triage results + reminder settings) and to the user's own
  inbox (approved sends + self-digest).

## What was verified (locally, mock mode)

- Engine regression on seed data: exact counts {3,7,5,3,2}, 6 drafts,
  10 tasks, needs-you-now [E02, E03, E01].
- All 13 endpoint checks pass in mock mode: status, run, emails, email
  detail, tasks, approve, edit, send (mocked, no Google call), settings
  get/post + validation errors, remind with wrong secret (401) and correct
  secret (reminded once, idempotent second sweep same hour), auth start
  302 with `access_type=offline`, `prompt=consent`, both scopes, CSRF
  state, and auth callback with a fake code failing cleanly (400).
- Frontend: all three files serve 200; zero gradients, zero emoji, zero
  AI-branding phrases, zero external URLs; every fetch maps to a backend
  endpoint.

## What could NOT be tested (needs Ronnie)

- The real Google OAuth handshake end-to-end (code exchange, refresh
  token receipt, Gmail profile read) — needs a real Google sign-in on the
  deployed site.
- Real Gmail list/get/send and real reminder digest delivery — exercised
  only via mocks.
- Netlify Blobs against the real store — exercised only via the in-memory
  fallback locally.
- The GitHub Actions workflow run — YAML written, not run (needs the repo
  + live site URL).
