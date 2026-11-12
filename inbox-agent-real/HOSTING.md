# Inbox Agent — Temporary Hosting Options

App shape this guide is written for: static frontend (`public/`) + one plain-JS
serverless function (`netlify/functions/api.mjs`, Netlify Functions v2, no build
step) + key-value storage (Netlify Blobs, store `inbox-agent`) + an hourly cron
(a GitHub Actions workflow that POSTs to `/api/remind`).

Note: the GitHub Actions cron is host-independent — it keeps working unchanged
on every option below, so no host's own cron/scheduler is strictly required.
What differs per host is the function runtime and the key-value store.

All limits below were checked against the provider's own pricing/docs pages on
13 Nov 2026. Anything I could not verify that way is marked **UNVERIFIED** —
treat it as unconfirmed, not fact. Sources are listed at the bottom.

## Netlify (current host)

- **Feasibility: works as-is.** Nothing to change — frontend, function,
  Blobs and the GitHub Actions cron already run here. Netlify also has its own
  Scheduled Functions (available on all plans, 30-second execution limit,
  minimum interval 1 minute), but they are not needed while the GitHub
  Actions cron exists.
- **Free tier:** $0, **300 credits/month, hard limit** — when credits run out
  the site pauses until the next cycle; no overage charges. Rates:
  15 credits per production deploy, 10 credits per GB-hour of compute
  (functions), 20 credits per GB of bandwidth, 2 credits per 10,000 web
  requests. Blob storage is listed as included on the Free plan.
- **Watch out:** 300 credits is small if deploys are frequent (20 production
  deploys alone would use it all). Function logs on Free keep only 24 hours.
- **Blobs free allowance:** **UNVERIFIED** — Netlify's pricing page lists Blob
  storage on the Free plan but I found no published numeric Blobs
  storage/operations cap in Netlify's own docs; do not assume a number.

## Vercel

- **Feasibility: small rewrite.** Static frontend deploys as-is. The function
  must move to Vercel's `api/` directory (plain Node.js works, so `api.mjs`
  needs only re-wiring, not a new language). **Netlify Blobs must be replaced**
  — the storage wrapper has to be rewritten against Vercel Blob (different
  API). The GitHub Actions cron keeps working unchanged.
- **Free tier (Hobby, $0):** 100 GB fast data transfer/month, 1M function
  invocations/month, 4 hours Fluid Active CPU, 360 GB-hours provisioned
  memory, 1 GB Blob storage (10K simple operations, 2K advanced operations,
  10 GB Blob data transfer per month). Hobby is for **non-commercial personal
  use only** — fine for a hackathon demo, not for a commercial product.
- **Cron caveat (only matters if you drop GitHub Actions):** Vercel's legacy
  Cron Jobs on Hobby run **at most once per day** — an hourly cron expression
  fails deployment. (Vercel's newer Schedules feature, still in beta, allows
  Hobby schedules as frequent as every 15 minutes, up to 5,000 runs per
  billing period.)

## Render

- **Feasibility: medium rewrite, and not free for the backend.** The static
  frontend is free on Render. But Render has no serverless-function model:
  `api.mjs` must become a **long-running Node web service** (add an HTTP
  server entrypoint), and Blobs must be replaced with Render Key Value
  (free instances exist) or another store. Render Cron Jobs are **not free**
  — they bill per minute while running, with a **$1/month minimum per cron
  job** — but the GitHub Actions cron avoids needing one.
- **Free tier:** $0 workspace; free web services get 512 MB RAM and
  **750 free instance hours per workspace per month**, but they **spin down
  after 15 minutes without traffic** and take ~1 minute to wake — so the
  hourly reminder POST would usually hit a cold start. A paid Starter web
  service (always on, 512 MB) is $7/month.

## Cloudflare Pages (+ Workers)

- **Feasibility: biggest rewrite.** Static frontend deploys free on Pages.
  The API must be rewritten as Pages Functions / a Worker (Workers runtime,
  not Node — `@netlify/blobs` will not work; storage moves to Workers KV
  bindings and the project needs Wrangler config). The GitHub Actions cron
  keeps working unchanged, so no Cloudflare Cron Trigger is needed.
- **Free tier (Workers Free, $0, no card):** 100,000 Worker/Functions
  requests per day, 10 ms CPU time per invocation, no egress/bandwidth
  charges, static-asset requests free and unlimited. Workers KV free:
  100,000 key reads/day, 1,000 writes/day, 1 GB stored. Pages: 500 builds
  per month, 1 build at a time, 20,000 files per site.
- **Cron Triggers free allowance:** **UNVERIFIED** — I could not confirm the
  free-plan Cron Trigger count from Cloudflare's own docs in this check
  (third-party write-ups say 5 per account); irrelevant while the GitHub
  Actions cron is used.
- **Paid step-up:** Workers Paid is $5/month minimum (10M requests and
  30M CPU-ms included).

## Recommendation

**Stay on Netlify for now** — it is the only option that works as-is, and
300 free credits/month is plenty for a demo with a handful of users. If a
move is ever forced, **Vercel is the easiest next step** (keep the GitHub
Actions cron, rewrite only the Blobs wrapper to Vercel Blob); pick
Cloudflare only if you expect real traffic and can afford the rewrite.

## Sources (checked 13 Nov 2026)

- Netlify pricing: https://www.netlify.com/pricing/
- Netlify Scheduled Functions: https://docs.netlify.com/build/functions/scheduled-functions/
- Netlify Blobs: https://docs.netlify.com/build/data-and-storage/netlify-blobs/
- Vercel pricing: https://vercel.com/pricing
- Vercel Cron Jobs usage & pricing: https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing
- Vercel Schedules limits: https://vercel.com/docs/schedules/limits
- Render pricing: https://render.com/pricing
- Render costs (free instances, cron $1 minimum, $7 Starter): https://render.com/articles/how-much-does-cloud-application-hosting-cost-for-small-businesses
- Cloudflare Workers pricing: https://developers.cloudflare.com/workers/platform/pricing/
- Cloudflare Pages limits: https://developers.cloudflare.com/pages/platform/limits/
