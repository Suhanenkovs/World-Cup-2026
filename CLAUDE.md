@AGENTS.md

# WC 2026 Predictions — Project Guide

## Stack
- **Next.js** (App Router) + **Supabase** + **Vercel** (auto-deploys on push to `master`)
- **Tailwind CSS** — glass card style: `bg-gray-900/50 backdrop-blur-sm border border-white/10`
- **football-data.org** free tier — standings, scorers, team info (10 req/min limit)

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
- `BONUS_LOCK_AT = TOURNAMENT_START` (first kickoff, Jun 11 2026) — all bonus answers lock simultaneously
- Match predictions lock individually at each match's kickoff time

### football-data.org API
- Standings: `GET /v4/competitions/WC/standings`
- Scorers: `GET /v4/competitions/WC/scorers?limit=100` (revalidate 300s)
- Team info: `GET /v4/teams/{apiId}` (revalidate 3600s)
- Guard against club data: `detail.type === "NATIONAL"` — api_id values in DB must be national team IDs

### Auth / users
- Invite-only — `supabase.auth.admin.inviteUserByEmail()` in `/api/admin/invite`
- Recovery email redirects through `/auth/callback?type=recovery` → `/reset-password`
- `k.suhanenkovs@inbox.lv` is a permanent admin — protected from deletion in `/api/admin/delete-user`
- Do NOT test invite flows in the same browser as your admin session — it overwrites your session

## Nav links (in order)
Group Stage · Knockout (desktop only) · Top Scorers · Matches · My Picks · Bonus · Leaderboard

## Deployment
Push to `master` → Vercel auto-deploys. No manual steps needed.
