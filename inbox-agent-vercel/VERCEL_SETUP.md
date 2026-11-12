# Inbox Agent — Vercel Setup Sheet

Move of the real Inbox Agent app from Netlify to Vercel. Staging folder:
`inbox-agent-vercel/` (this folder). The live Netlify site, the prototype,
and the repo were not touched by this work.

## What is in this folder

- `public/` — `index.html`, `app.js`, `styles.css`, `logo.svg`, copied
  byte-for-byte from `~/workspace/inbox-agent-real/public/` (SHA-256
  verified identical; see "Frontend verification" below). No Netlify
  references were in the frontend, so nothing in it was changed. All API
  calls are same-origin relative `/api/*` — unchanged.
- `api/index.js`, `vercel.json`, `package.json` — backend worker's scope,
  not this sheet's. Do not deploy without them in place.
- `.gitignore` — `node_modules/`, `.vercel/`, `.env*`, OS junk. No secrets.

## Step 1 — Push this folder to GitHub

Push the contents of `inbox-agent-vercel/` into the repo
**`luckynyt95/inbox-agent`** as the subfolder **`inbox-agent-vercel/`**
(at the repo root, alongside the existing `inbox-agent-real/` folder —
do not replace it). Also place `reminders.yml` at
`.github/workflows/reminders.yml` in the repo root (see Step 5).

> Note: Vercel docs state a Hobby team cannot connect a project to a Git
> repository owned by a GitHub **organization**
> (https://vercel.com/docs/limits). `luckynyt95/inbox-agent` is a personal
> account repo, so this does not apply — but if the repo ever moves under
> an org, Hobby import will fail and Pro is required.

## Step 2 — Create the Vercel project (dashboard)

1. Go to https://vercel.com/dashboard → **Add New…** → **Project**.
2. Under **Import Git Repository**, pick `luckynyt95/inbox-agent` →
   **Import**. (If GitHub is not connected yet, Vercel will ask to install
   the Vercel GitHub App on the account first — exact prompt wording may
   vary; follow it.)
3. On the import screen, click **Edit** next to **Root Directory** and
   select the `inbox-agent-vercel` folder. This is the "Root Directory"
   setting Vercel documents for deploying a subfolder of a repo
   (https://vercel.com/docs/monorepos — "Click the Edit button next to
   the Root Directory setting to select the directory").
4. **Framework Preset:** pick **Other** (no framework — plain static files
   + one Node serverless function). Leave Build Command / Output Directory
   empty/default. Exact preset label may vary; "Other" is the preset for
   a no-framework site.
5. Click **Deploy**. The first deploy will fail or the API will 500 until
   the env vars (Step 4) and the Blob store (Step 3) exist — that is
   expected. Add them, then redeploy (see Step 4 note: env vars only apply
   to deployments made *after* they are set).
6. The live URL will be `https://<name>.vercel.app` (Vercel picks `<name>`
   from the repo/project name; you can rename it in Project → Settings →
   General → Project Name — exact label may vary). Note the final URL;
   Steps 5 and 6 need it. Find it on the project's **Deployments** page
   (click the production deployment, or the **Visit** button) and in
   Project → Settings → **Domains** (the `.vercel.app` domain is listed
   there).

## Step 3 — Create the Blob store (dashboard)

Vercel Blob replaces Netlify Blobs. Per Vercel's Blob docs
(https://vercel.com/docs/vercel-blob/server-upload):

1. Open the project → **Storage** in the sidebar → **Create Storage** →
   choose **Blob** → **Continue**.
2. Set access to **Private** (the backend reads/writes tokens server-side
   with the token; nothing in the browser needs direct Blob URLs).
3. Name the store `inbox-agent` (same name as the Netlify store, for
   clarity — the name is only a label; the backend keys off the token).
4. Tick **Add a read-write token env var to this connection** (wording per
   the docs; the current dashboard label may differ slightly). This is
   what creates the `BLOB_READ_WRITE_TOKEN` environment variable on the
   project automatically — do **not** also add it by hand in Step 4.
   Production and Preview are connected by default; Development is not
   needed for this deploy.
5. Click **Create**. You land on the store page. Verify under the store's
   **Projects** tab (or Project → Settings → Environment Variables) that
   `BLOB_READ_WRITE_TOKEN` now exists.

## Step 4 — Environment variables (dashboard)

Project → **Settings → Environment Variables** (per Vercel's env-var docs,
values are encrypted at rest; a "Secret" type is write-only after saving).
Add each key, set the value, scope **Production** (Preview too if you want
preview deploys to work — harmless), click **Save**. Then **redeploy**:
env-var changes only apply to new deployments, not the one already live
(https://vercel.com/docs/environment-variables).

| Variable | Value | Type |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Client ID from the EXISTING Google OAuth client (Step 6) | Config |
| `GOOGLE_CLIENT_SECRET` | Client secret from the same client | **Secret** |
| `REMIND_SECRET` | A long random string, e.g. `openssl rand -hex 32`. **Must be the SAME value** as the GitHub repo secret in Step 5. Reuse the value already used on Netlify if you still have it — that keeps the workflow working without a secret rotation. | **Secret** |
| `BLOB_READ_WRITE_TOKEN` | Created automatically in Step 3 — do not add by hand | (auto) |

Never commit any of these values. Never set `MOCK_GMAIL` in production
(local verification switch only).

## Step 5 — Reminder workflow (GitHub Actions)

The workflow file is `~/workspace/inbox-agent-real-workflow/reminders.yml`
— it must live at `.github/workflows/reminders.yml` in the repo root.

1. In that file, change **only** the `SITE_URL` value:
   - From: `SITE_URL: "https://REPLACE-WITH-YOUR-NETLIFY-URL.netlify.app"`
   - To: `SITE_URL: "https://<name>.vercel.app"` (the real URL from
     Step 2, no trailing slash).
   - Also update the two comments that say "Netlify" in that file
     ("replace with your Netlify site URL" / "same value as the ...
     environment variable on the Netlify site") to say Vercel, so the
     next reader is not misled.
2. No other workflow change: the schedule stays `0 * * * *` (hourly), the
   POST stays `/api/remind` with header `X-Remind-Secret`, and the repo
   secret stays named `REMIND_SECRET` with the same value as the Vercel
   env var in Step 4. Repo → Settings → Secrets and variables → Actions:
   confirm the `REMIND_SECRET` secret exists; create it only if missing.
3. The GitHub Actions cron is host-independent — it keeps running
   unchanged against the Vercel URL. Vercel's own Cron Jobs are **not**
   used and not needed.
4. After the first deploy, run it once manually (Actions tab →
   workflow → **Run workflow**) and check it returns 200.

## Step 6 — Google Cloud Console: add the Vercel URLs to the EXISTING OAuth client

Do **not** create a new client. Use the existing one: project
**"Inbox Agent"** (`loyal-bit-514518-a8`), client "Inbox Agent web".

1. https://console.cloud.google.com/ → project "Inbox Agent" → APIs &
   Services → Credentials → open the "Inbox Agent web" OAuth client.
2. Under **Authorized JavaScript origins**, **add** (do not replace):
   `https://<name>.vercel.app`
3. Under **Authorized redirect URIs**, **add** (do not replace):
   `https://<name>.vercel.app/api/auth/callback`
4. **Keep the existing Netlify origin and redirect URI** — the Netlify
   site stays live until the Vercel move is proven, and removing them
   would break it. Save.
5. Scope check (from the v2 notes in `SETUP.md`): the app now requests
   **only** the `https://www.googleapis.com/auth/gmail.modify` scope.
   Confirm `gmail.modify` is on the consent screen's scope list
   (Cloud Console → Google Auth platform → Data Access); if it is not
   there yet, add it — otherwise sign-in works but mark-as-read fails.
   No redirect-URI redeploy is needed after this step (Google checks
   redirect URIs live).

## Step 7 — What Ronnie does in the app (after deploy)

1. Open `https://<name>.vercel.app` → **Disconnect**, then **Connect
   Gmail** again — a fresh session on the new host, and the reconnect
   also picks up the `gmail.modify` scope (see Step 6.5). Until then the
   app shows "Reconnect to enable mark-as-read". Note: Testing-mode
   refresh tokens expire after 7 days, so reconnect is weekly regardless.
2. Click **Run the agents** and confirm counts / inbox / tasks populate.
3. Settings → reminders: pick frequency (1–5/day), the exact hours,
   timezone; use **Send test reminder** to confirm delivery.
4. Optionally connect the second Gmail
   (`ramkumarluckymedicos@gmail.com`): it must first be added as a test
   user or it gets `access_denied` at Google's consent screen —
   Google Auth platform → Audience → Test users → Add users — then
   Connect Gmail with that account in the app. (It is already a test
   user from the Netlify setup; re-check only if sign-in fails.)
5. Smoke-test checklist: `/api/status` returns 200; sign-in completes;
   **Run the agents** returns the real counts; one draft Approve/Edit
   works; the manual Actions workflow run returns 200.

## Vercel Hobby limits that matter for this app

All figures below were verified against Vercel's own pages on 13 Nov
2026 (fetched, not copied from HOSTING.md or third-party round-ups):

- Pricing page: https://vercel.com/pricing (crawled 12 Nov 2026 23:16 UTC)
- Hobby plan docs: https://vercel.com/docs/plans/hobby (last updated
  2026-09-14)
- Limits docs: https://vercel.com/docs/limits (last updated 2026-09-16)
- Blob pricing table: https://vercel.com/docs/pricing (Blob rows, same
  values as the pricing page)

| Resource | Hobby included (per month unless noted) | What it means here |
|---|---|---|
| Function invocations | First **1,000,000** | Enormous headroom: the app is a handful of users + 24 reminder sweeps/day. |
| Fast Data Transfer | First **100 GB** | The whole frontend is ~57 KB; effectively unlimited for this app. |
| Fast Origin Transfer | First **10 GB** | Function responses back to the CDN. Fine. |
| CDN Requests | First **1,000,000** | Every page/API hit counts; still far above this app's traffic. |
| Fluid Active CPU | **4 CPU-hours** | The Gmail pipeline runs are short; watch this only if runs get long. |
| Fluid Provisioned Memory | **360 GB-hours** | Same — fine at this scale. |
| Blob storage | **1 GB / month** | Tokens + triage JSON are kilobytes. Fine. |
| Blob Simple operations | First **10,000** | `head()` / cache-miss reads. Fine. |
| Blob Advanced operations | First **2,000** | `put()` / `list()` / `copy()` / store creation (creating the store itself costs 1). Fine at this scale; the scarcest Blob meter — worth watching if users grow. |
| Blob Data Transfer | First **10 GB** | Separate from Fast Data Transfer. Fine. |
| Function max duration | **300 s (5 min), default and max** | Fluid compute (on by default for new projects). The Gmail run over 50 messages is well inside this. Note: this 300 s figure is the *Fluid-compute* limit — pre-Apr-2025 non-Fluid projects had a 60 s Hobby max, which does **not** apply to a new project. |
| Function memory / CPU | **2 GB / 1 vCPU**, default and max | Fine. |
| Runtime logs | **1 hour** retention | Debug quickly after a failure; logs vanish after an hour. (Netlify Free kept 24 h.) |
| Deployments | **100 / day**, 1 concurrent build, 45-min build cap | Fine. |
| Projects | 200 per Hobby team | Fine. |
| Domains per project | 50 | Fine. |

Over-limit behaviour (Hobby): there is **no overage billing** — the
pricing FAQ states "If you have a free Hobby account, you are limited
to the usage caps and cannot purchase additional usage", and the Hobby
docs state that in most cases, if you exceed a limit you wait until 30
days have passed before you can use that feature again. So a blown
limit pauses the feature, it never produces a bill.

### Can a Hobby project deploy without a card? — UNVERIFIED from Vercel's own docs

Vercel's own pages describe Hobby as **free** with **no billing cycles**
(Hobby docs) and state you cannot be charged beyond the caps (pricing
FAQ: "If you have a free Hobby account, you are limited to the usage
caps and cannot purchase additional usage"). The Pro-trial docs add
"Charges apply only if you have a payment method" — i.e. with no payment
method on file, nothing can be charged. What I could **not** find on any
Vercel-owned page is the explicit sentence "Hobby requires no credit
card" (third-party guides say it, Vercel's own pages do not say it in
those words). Treat "no card needed" as **UNVERIFIED** — but the
mechanics above mean the worst case is a deploy-time prompt, not a
surprise charge: if Vercel ever asks for a card, stop and do not enter
one without checking first.

### Non-commercial condition

Hobby is for **personal, non-commercial use only** — Vercel's pricing
FAQ ("Our Hobby plan is for personal, non-commercial use") and its Fair
Use Guidelines ("Hobby teams are restricted to non-commercial personal
use only. All commercial usage of the platform requires either a Pro or
Enterprise plan"). This app is a hackathon demo / personal project, so
Hobby fits. If it ever becomes a commercial product, it must move to
Pro ($20/developer seat/month).

## Caveats — what could NOT be tested live

- **Real Vercel Blob** — no store was created and no read/write was run
  against a live Blob store in this work. The storage wrapper is the
  backend worker's code; verify after deploy that a sign-in actually
  persists (refresh token round-trip) and that `/api/status` reports the
  cached run.
- **Real OAuth round-trip on the Vercel URL** — the redirect URI cannot
  be proven until the site is live and a real Google sign-in is done
  (Step 7.1). A typo in the origin/redirect URI fails at Google's
  consent screen, not in the app.
- **GitHub Actions workflow run** — the YAML was only edited in text;
  no run against the Vercel URL has happened. Run it manually once
  (Step 5.4).
- **Dashboard UI labels** — the steps above follow Vercel's current
  docs pages (linked), but Vercel renames dashboard buttons; where a
  label is quoted from docs rather than seen live, it is flagged
  ("exact label may vary"). If a step's button is named differently on
  the day, follow the docs link, not the label in this sheet.
- **Deploy itself** — nothing was deployed from this staging folder.
  First deploy + redeploy-after-env-vars is still to be done by the
  parent.
- **Old limits note:** HOSTING.md's Vercel numbers (100 GB, 1M
  invocations, 1 GB Blob, 10K/2K ops, 10 GB Blob transfer) all still
  check out against Vercel's current pages — no correction needed.

## Frontend verification (done in this staging)

- `public/index.html` — 5,194 bytes, SHA-256
  `b60a6e50538f3807fb7dc5f66fa06529e59135bda74ecb84f0c2551389923e1b`
- `public/app.js` — 36,696 bytes, SHA-256
  `890a540d25d9c40487d6ac1061a426517b78584398374a7354d3392d54279600`
- `public/styles.css` — 14,571 bytes, SHA-256
  `2f2b66ed8f2dc71e9eff0418c3d3fe26a1e0c3ed0b8f3e3bff59ac838cd596af`
- `public/logo.svg` — 343 bytes, SHA-256
  `0bf0b9e8cb6fecda8de71318980abe1d2284f8438ba9486255b5777ad12dfe76`
- All four are SHA-256-identical to
  `~/workspace/inbox-agent-real/public/`. Zero Netlify references found
  in the frontend (grep for "netlify": 0 matches in all four files), so
  no fixes were needed. The only `http` string in the copies is the SVG
  XML namespace in `logo.svg` (`http://www.w3.org/2000/svg`), which is
  not a network reference. All fetch calls are same-origin `/api/*`.
