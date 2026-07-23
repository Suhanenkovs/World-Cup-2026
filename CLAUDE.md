@AGENTS.md

# WC 2026 Predictions — Project Guide

## What this is
A private, invite-only World Cup predictions game. Players predict match scores, answer bonus questions (tournament winner, golden boot, etc.), and earn points. A live leaderboard tracks standings. Admin manages invites, payments, and resolves bonus answers.

---

## Stack
- **Next.js 15** (App Router) + **Supabase** (Postgres + Auth) + **Vercel** (auto-deploys on push to `master`)
- **Tailwind CSS** — glass card style: `bg-gray-900/50 backdrop-blur-sm border border-white/10`
- **football-data.org** free tier — scorers and team squad data (10 req/min limit). NOT used for standings or live scores.
- **cron-job.org** — external cron calling `/api/cron/sync-scores` every 5 minutes with `Authorization: Bearer {CRON_SECRET}`. **Never use Vercel crons** — Hobby plan only supports daily intervals and it blocks deployments.
- **flagcdn.com** — flag images via `lib/teamFlags.ts` → `getFlagUrl(teamName)`. Always use `loading="lazy"` on flag `<img>` tags to suppress Next.js 19 SSR preload warnings.

---

## Key Next.js conventions
- `params` and `searchParams` are **Promises** — always `await` them
- `export const revalidate = N` controls ISR per page. Post-tournament: set all pages to `86400` (24h).
- The middleware file is **`proxy.ts`** (not `middleware.ts`)
- Public paths are defined in `proxy.ts` → `PUBLIC_PATHS` array
- Never use `<Image>` from next/image for flag CDN URLs — use plain `<img>` with `eslint-disable-next-line @next/next/no-img-element` comment

---

## Supabase
- `createClient()` — user context, respects RLS (server components / API routes)
- `createServiceClient()` — service role, bypasses RLS (admin operations only)
- After `ALTER TABLE`, run `NOTIFY pgrst, 'reload schema';` in Supabase SQL Editor to refresh PostgREST schema cache
- The `handle_new_user` trigger auto-creates a profile on signup/invite; username defaults to email prefix, with numeric suffix on collision (`kaspars` → `kaspars1`)

### Key tables
| Table | Purpose |
|---|---|
| `matches` | All tournament matches — group stage + knockout. Fields: `match_number`, `stage`, `group_letter`, `home_team_id`, `away_team_id`, `home_score`, `away_score`, `home_score_et`, `away_score_et`, `penalties_home`, `penalties_away`, `score_duration`, `status`, `scheduled_at`, `venue` |
| `teams` | All WC teams. Fields: `name`, `short_name`, `api_id` (football-data.org ID), `flag_url`, `group_letter` |
| `predictions` | One row per user per match. Fields: `user_id`, `match_id`, `pred_home`, `pred_away`, `points_earned` |
| `profiles` | One row per user. Fields: `id`, `username`, `name`, `email`, `paid`, `is_admin` |
| `bonus_questions` | Questions like "Who wins the tournament?". Fields: `question`, `category`, `max_points`, `answer_type`, `options`, `correct_answer`, `resolved_at`, `sort_order` |
| `bonus_answers` | One row per user per question. Fields: `user_id`, `question_id`, `answer`, `points_earned` |
| `leaderboard` | Materialized view / table of totals. Fields: `id`, `name`, `username`, `total_points`, `match_points`, `bonus_points`, `correct_predictions` |
| `prize_config` | Single row: `entry_fee`, `admin_cost`, `winner_pct`, `second_pct`, `third_pct`, `fourth_pct`, `fifth_pct` |

---

## Auth / users
- Invite-only — `supabase.auth.admin.inviteUserByEmail()` in `/api/admin/invite`
- Recovery email redirects through `/auth/callback?type=recovery` → `/reset-password`
- `k.suhanenkovs@inbox.lv` is a permanent admin — protected from deletion in `/api/admin/delete-user`
- **Do NOT test invite flows in the same browser as your admin session** — it overwrites your session

---

## Nav links (in order)
Group Stage · Knockout · Top Scorers · Matches · My Picks · Bonus · Leaderboard

- Home (`/`) redirects logged-in users to `/bracket` (the knockout bracket)
- "Knockout" link goes to `/bracket`
- All nav links are in `components/Nav.tsx` → `NAV_LINKS` array

---

## Routing structure
```
app/
  page.tsx              Landing (unauthenticated) / redirect to /bracket (authenticated)
  groups/               Group stage standings
  bracket/              Knockout bracket (visual tree + mobile list)
  scorers/              Top scorers / Golden Boot
  matches/              Match schedule list (tabs: Results / Upcoming)
  matches/[id]/         Match detail + predictions
  predictions/          My Picks (tabs: Results / Upcoming)
  bonus/                Bonus questions
  leaderboard/          Leaderboard
  players/[id]/         Individual player prediction history
  teams/[apiId]/        Team page (matches + goal contributors)
  admin/                Admin panel (Prize & Participants / Bonus Questions tabs)
  login/                Login page
  join/                 Join page (for invited users)
  reset-password/       Password reset
  auth/callback/        Supabase auth callback
  api/
    cron/sync-scores/   Score sync + bracket auto-promotion (called by cron-job.org)
    admin/
      invite/           Invite a new user
      mark-paid/        Toggle payment status
      set-admin/        Toggle admin flag
      set-name/         Set display name
      delete-user/      Delete user (k.suhanenkovs@inbox.lv is protected)
      reset-link/       Generate password reset link
      bonus-questions/  CRUD for bonus questions
      resolve-bonus/    Mark correct answer + score all submissions
      auto-resolve/     Auto-resolve from football-data.org (tournament winner, scorer, finalists)
      prize-config/     Update prize pool config
      update-match/     Manually set match score/status
      fix-bracket/      Re-run bracket promotion (force=true)
      rescore/          Bulk rescore all finished matches
      score-audit/      Audit stored points vs recalculated values
    players/            Player search for bonus question autocomplete
```

---

## Score syncing (`/api/cron/sync-scores`)
- Called every 5 minutes by **cron-job.org** (NOT Vercel crons)
- Requires `Authorization: Bearer {CRON_SECRET}` header
- Sync logic: if kickoff time has passed and API still says TIMED → set status to `live`. Only sets `finished` when API explicitly returns FINISHED.
- **Regression protection**: never downgrades status or wipes a non-null score with null
- Points calculated only when `status = finished` — never during live
- Also runs **bracket auto-promotion** on every tick (even between game days)

### football-data.org free-tier score quirks
- `score.fullTime` is **unreliable** for ET/PSO matches — always use `score.regularTime` when present
- `score.extraTime` = goals scored **only in ET period** (not cumulative). Cumulative AET = `regularTime + extraTime`
- Free tier doesn't capture sudden-death penalty kicks. Tied `penalties_home === penalties_away` = null/incomplete — wait for correction
- Penalties can never legitimately draw — if API returns tied pens, store null
- If API doesn't self-correct within ~3h, enter penalty scores manually via admin panel

---

## Bracket auto-promotion
- Winners are promoted from match results in our own DB — **never use FD API for this**
- `BRACKET` constant in `lib/bracket.ts` maps `match_number → { nextNumber, slot }`
- Winner logic priority: untied pens → cumulative AET score → regulation score. Tied pens = skip.
- If slot is already filled, promotion skips it — manually corrected slots are safe
- **If you manually fix a DB slot**: deploy code first, then fix DB — otherwise next cron tick may undo it

### Match numbering — CRITICAL
**openfootball numbering ≠ ESPN numbering** for R16 matches. Our DB was seeded from openfootball:
- M89: Paraguay vs France | M90: Canada vs Morocco
- M91: Brazil vs Norway | M92: Mexico vs England
- M93: Portugal vs Spain | M94: USA vs Belgium
- M95: Argentina vs Egypt | M96: Switzerland vs Colombia
- ESPN shows the same games with different match numbers. Always use **our DB match_numbers**, not ESPN's.

### Bracket visual tree (bracket/page.tsx)
The desktop bracket pairs adjacent array positions via `LeftConn`/`RightConn` components:
- Array positions [0,1] connect to next round [0], [2,3] → [1], etc.
- Array **order** determines which R32 matches visually connect to which R16 match
- Left side (→ SF M101): `r32L = [74,77, 73,75, 83,84, 81,82]` → `r16L = [89,90, 93,94]` → `qfL = [97,98]` → `sfL = 101`
- Right side (→ SF M102): `r32R = [76,78, 79,80, 86,88, 85,87]` → `r16R = [91,92, 95,96]` → `qfR = [99,100]` → `sfR = 102`

---

## Scoring
- Points defined in `lib/constants.ts`: `POINTS_CORRECT_RESULT`, `POINTS_GOAL_DIFF`, `POINTS_EXACT_SCORE` — all vary by stage
- Knockout predictions scored on **90-minute regulation score only** — ET and penalties don't count
- Predictions rescored whenever stored score changes (API correction), not just on first finish
- Bonus answers scored: `answer.trim().toLowerCase()` compared against `correct_answer.split("|")` — case-insensitive, pipe-separated for multiple valid answers

---

## Bonus questions
- `BONUS_LOCK_AT = TOURNAMENT_START` — all bonus answers lock simultaneously at first kickoff
- Match predictions lock individually at each match's kickoff time
- `TOURNAMENT_START` is `2026-06-11T19:00:00Z` (UTC)
- Answer types: `text`, `number`, `team` (all WC teams dropdown), `player` (player autocomplete from `/api/players`), `yesno`, `select` (custom dropdown)
- Multi-answer: store correct answer as `Answer A|Answer B` (pipe-separated)
- Player answers: must match exactly what `/api/players` returns (from football-data.org squad data). If a participant manually typed a non-standard name, fix it via Supabase SQL: `UPDATE bonus_answers SET answer = 'Correct Name' WHERE answer = 'Wrong Name';`

---

## Top Scorers / Golden Boot
- Sorted by FIFA Golden Boot tiebreakers: **goals → assists → fewest minutes played**
- FD free tier doesn't provide minutes played — resolve ties manually via admin panel
- Penalties are **NOT** a tiebreaker — exclude from sort

---

## Admin panel
Located at `/admin`. Two tabs:

**Prize & Participants tab:**
- Prize pool config (entry fee, admin costs, prize place percentages)
- Invite player (email + name)
- Player list (mark paid, toggle admin, set display name, get reset link, delete)

**Bonus Questions tab:**
- Add / edit / delete bonus questions
- Resolve each question with correct answer (triggers scoring of all submissions)

---

## Key components
| Component | Purpose |
|---|---|
| `components/Nav.tsx` | Top navigation bar with auth state |
| `components/MatchCard.tsx` | Match row card used in matches list |
| `components/BonusForm.tsx` | Bonus answer submission form |
| `components/BonusAllAnswers.tsx` | "All Answers" tab showing everyone's bonus picks |
| `components/PredictionsGrid.tsx` | Grid of predictions per match |
| `components/AdminPanel.tsx` | Admin UI (participants + bonus management) |
| `components/MatchResultsPanel.tsx` | Match results list with score entry |
| `components/AutoRefresh.tsx` | Auto-refreshes page during live matches |
| `components/TabSwitcher.tsx` | Reusable tab navigation |
| `components/BackButton.tsx` | Back navigation button |
| `lib/bracket.ts` | `BRACKET` constant (promotion map) + `promoteBracket()` function |
| `lib/teamFlags.ts` | `getFlagUrl(teamName)` → flagcdn.com URL |
| `lib/teamTLA.ts` | `getTeamTLA(teamName)` → 3-letter abbreviation |
| `lib/constants.ts` | `TOURNAMENT_START`, `BONUS_LOCK_AT`, `STAGE_LABELS`, `STAGE_ORDER`, points constants |

---

## Deployment
- Push to `master` → Vercel auto-deploys. No manual steps.
- **NEVER add cron jobs to `vercel.json`** — it blocks all deployments on the Hobby plan
- Use cron-job.org for recurring tasks
- All times stored and displayed in **Europe/Riga** timezone

---

## Template notes (for future tournaments)
To adapt this for a new tournament:
1. Re-seed `matches` and `teams` tables from openfootball or similar source
2. Update `TOURNAMENT_START` in `lib/constants.ts`
3. Update match numbers in `lib/bracket.ts` (`BRACKET` constant) and `app/bracket/page.tsx` arrays
4. Update `app/teams/[apiId]/page.tsx` `FD_NAME_ALIASES` map if team name variants differ
5. Update points constants in `lib/constants.ts` if scoring changes
6. Re-enable cron on cron-job.org and set pages back to short `revalidate` values during live play
7. Reset bonus questions via Supabase (delete old, insert new)
8. The bracket visual tree only works for a 32-team single-elimination format — restructure `bracket/page.tsx` for other formats
