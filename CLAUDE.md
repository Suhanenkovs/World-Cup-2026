@AGENTS.md

# WC 2026 Predictions — Project Guide

## Stack
- **Next.js** (App Router) + **Supabase** + **Vercel** (auto-deploys on push to `master`)
- **Tailwind CSS** — glass card style: `bg-gray-900/50 backdrop-blur-sm border border-white/10`
- **football-data.org** free tier — scorers, team info (10 req/min limit). NOT used for standings.
- **cron-job.org** — external cron service calling `/api/cron/sync-scores` every 5 minutes with `Authorization: Bearer {CRON_SECRET}`

## Key conventions

### Next.js App Router
- `params` and `searchParams` are **Promises** — always `await` them
- `export const revalidate = N` controls ISR per page
- The middleware file is **`proxy.ts`** (not `middleware.ts`)
- Public paths are defined in `proxy.ts` → `PUBLIC_PATHS` array

### Supabase
- `createClient()` — user context, respects RLS (server components / API routes)
- `createServiceClient()` — service role, bypasses RLS (admin operations only)
- After `ALTER TABLE`, run `NOTIFY pgrst, 'reload schema';` in SQL Editor to refresh PostgREST schema cache
- The `handle_new_user` trigger auto-creates a profile on invite; username defaults to email prefix, with numeric suffix on collision (`kaspars` → `kaspars1`)

### Bonus questions
- Multi-answer questions: store correct answer as `Team A|Team B` (pipe-separated)
- Both manual resolve (`/api/admin/resolve-bonus`) and auto-resolve split on `|` before scoring
- `BONUS_LOCK_AT = TOURNAMENT_START` — all bonus answers lock simultaneously at first kickoff
- Match predictions lock individually at each match's kickoff time
- `TOURNAMENT_START` is `2026-06-11T19:00:00Z` (**UTC**, not EDT — the first match kicks off at 19:00 UTC)

### football-data.org API
- Scorers: `GET /v4/competitions/WC/scorers?limit=100` (revalidate 60s)
- Team info: `GET /v4/teams/{apiId}` (revalidate 3600s)
- Guard against club data: `detail.type === "NATIONAL"` — api_id values in DB must be national team IDs
- **Free tier does NOT provide live/real-time match scores.** The `/matches` endpoint stays `TIMED` with null scores during a match. It does eventually update to `FINISHED` with the correct score after the match ends (delay unknown, can be minutes to hours).
- Do NOT use the standings endpoint — it includes in-progress matches. Group standings are computed from our DB `finished` matches only.

### Auth / users
- Invite-only — `supabase.auth.admin.inviteUserByEmail()` in `/api/admin/invite`
- Recovery email redirects through `/auth/callback?type=recovery` → `/reset-password`
- `k.suhanenkovs@inbox.lv` is a permanent admin — protected from deletion in `/api/admin/delete-user`
- Do NOT test invite flows in the same browser as your admin session — it overwrites your session

## Nav links (in order)
Group Stage · Knockout (desktop only) · Top Scorers · Matches · My Picks · Bonus · Leaderboard

### Score syncing (`/api/cron/sync-scores`)
- Called every 5 minutes by **cron-job.org** (not Vercel crons — Vercel Hobby plan only supports daily intervals)
- **Never add cron config to `vercel.json`** — it blocks all deployments on the Hobby plan
- The cron requires `Authorization: Bearer {CRON_SECRET}` header — configured in cron-job.org job settings and in Vercel environment variables
- Sync logic: if kickoff time has passed and API still says TIMED → set status to `live`. Only sets `finished` when API explicitly returns FINISHED.
- **Regression protection**: never downgrades status (live→scheduled) or wipes a non-null score with null, in case the API momentarily returns stale data
- Prediction points are only calculated and written when `status = finished` — never during a live match

## Deployment
Push to `master` → Vercel auto-deploys. No manual steps needed.
**Do NOT add cron jobs to `vercel.json`** — use cron-job.org instead (see Score syncing above).
