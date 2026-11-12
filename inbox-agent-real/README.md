# Inbox Agent — real backend (v1)

Netlify Functions v2 backend that connects to **any Gmail via OAuth** and
runs the verified deterministic triage engine on the user's real inbox.
One file: `netlify/functions/api.mjs` (plain JavaScript, no build step).
Frontend is the full professional SPA in `public/` (`index.html`, `app.js`, `styles.css`) — Connect Gmail, counts, needs-you-now, filterable inbox, email detail with draft approve/edit/send, tasks, and reminder settings.

## Deploy

1. Push this folder to a repo (or drag-drop / `netlify deploy` from it).
2. In Netlify: Site settings → Environment variables, set:
   - `GOOGLE_CLIENT_ID` — Google OAuth web client ID
   - `GOOGLE_CLIENT_SECRET` — Google OAuth web client secret
   - `REMIND_SECRET` — a long random string, shared with the GitHub
     Actions workflow (`~/workspace/inbox-agent-real-workflow/reminders.yml`)
3. In Google Cloud Console, add the authorized redirect URI:
   `https://<your-site>.netlify.app/api/auth/callback`
   (scopes requested: `gmail.readonly` + `gmail.send`).
4. No build command. `netlify.toml` sets `publish = "public"`,
   `functions = "netlify/functions"`.

## Auth flow

- `GET /api/auth/start` → 302 to Google (offline access, prompt=consent,
  random CSRF `state` stored briefly in Blobs).
- `GET /api/auth/callback` → verifies state, exchanges the code, stores
  the refresh token + Google user id + email in Netlify Blobs
  (store `inbox-agent`), creates a random session token, redirects to
  `/?session=<token>`. The frontend saves it to `localStorage` and sends
  it as `Authorization: Bearer <token>` on every `/api` call.
- Unknown/expired token → 401. No secrets anywhere in code.

## Scopes note

`gmail.send` is ONLY used for (a) a draft the user explicitly
approves AND confirms in the UI, and (b) the reminder digest email to the
user themself. Nothing is ever sent or deleted otherwise.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/status` | `{engine, llm_available:false, total_emails, last_run_seconds, note, connected, email}` |
| GET | `/api/auth/start` | 302 to Google OAuth |
| GET | `/api/auth/callback` | code exchange → session redirect |
| POST | `/api/run` | pipeline over last 50 inbox messages; `{counts, total, drafts_written, tasks_found, needs_you_now, seconds, engine:"deterministic"}` |
| GET | `/api/emails?category=` | `{emails, counts}` |
| GET | `/api/emails/:id` | one triaged email (+ edited draft, approved flag) |
| GET | `/api/tasks` | `{tasks, count}` |
| POST | `/api/drafts/:id/approve` | local state only |
| POST | `/api/drafts/:id/edit` | `{text}` — local state only |
| POST | `/api/drafts/:id/send` | `{confirmed:true}` + approved required; replies in-thread via Gmail API |
| GET/POST | `/api/reminders/settings` | `{frequency 1–5, hours ["HH:MM", …], timezone, enabled}` |
| POST | `/api/remind` | header `X-Remind-Secret`; hourly, idempotent per hour; `{reminded:[emails]}` |

## Mock mode (local verification ONLY)

Set `MOCK_GMAIL=true` to run the engine on the 20 seed emails (shaped as
Gmail API messages through the same parser), mock token refresh, and
record sends instead of calling Google. Never set it in production —
it requires the explicit env var and changes nothing unless set.

## Reminders

GitHub Actions workflow (hourly cron) lives separately at
`~/workspace/inbox-agent-real-workflow/reminders.yml` — it curls
`POST <site>/api/remind` with `X-Remind-Secret` from the repo secret
`REMIND_SECRET`. Replace the placeholder site URL with the Netlify URL.

## Engine

Triage / priority / draft / task / pipeline logic is copied verbatim from
the verified prototype
(`~/workspace/inbox-agent-netlify/netlify/functions/api.mjs`). On the seed
data it produces counts `{urgent:3, action:7, fyi:5, promo:3, spam:2}`,
6 drafts, 10 tasks, `needs_you_now ["E02","E03","E01"]`.
