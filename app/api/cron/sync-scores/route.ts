import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { calculateMatchPoints, type Stage } from "@/lib";

const FD_BASE = "https://api.football-data.org/v4";

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(fdStatus: string): "scheduled" | "live" | "finished" {
  if (["IN_PLAY", "PAUSED", "HALFTIME"].includes(fdStatus)) return "live";
  if (["FINISHED", "AWARDED"].includes(fdStatus)) return "finished";
  return "scheduled"; // TIMED, SCHEDULED, POSTPONED, CANCELLED, etc.
}

// ── Team name normalisation ───────────────────────────────────────────────────
// Keys must be already-normalised (no diacritics, no spaces, lowercase) because
// the lookup happens after normalize() strips those from the input.

const ALIASES: Record<string, string> = {
  "usa":                          "unitedstates",
  "unitedstatesofamerica":        "unitedstates",
  "korearepublic":                "southkorea",
  "republicofkorea":              "southkorea",
  "iriran":                       "iran",
  "islamicrepublicofiran":        "iran",
  "turkiye":                      "turkey",
  "cotedivoire":                  "ivorycoast",
  "democraticrepublicofthecongo": "drcongo",
  "congodr":                      "drcongo",
  "bosniaandherzegovina":         "bosnia",
  "bosniaherzegovina":            "bosnia",
  "northmacedonia":               "macedonia",
  "republicofireland":            "ireland",
  "capeverde":                    "caboverde",
};

function normalize(name: string): string {
  const raw = name
    .toLowerCase()
    .replace(/[àáâãäå]/g, "a")
    .replace(/[èéêë]/g, "e")
    .replace(/[ìíîï]/g, "i")
    .replace(/[òóôõöø]/g, "o")
    .replace(/[ùúûü]/g, "u")
    .replace(/[ýÿ]/g, "y")
    .replace(/[ñ]/g, "n")
    .replace(/[ç]/g, "c")
    .replace(/[^a-z0-9]/g, "");
  return ALIASES[raw] ?? raw;
}

function teamsMatch(fdName: string, dbName: string): boolean {
  return normalize(fdName) === normalize(dbName);
}

// ── football-data.org types ───────────────────────────────────────────────────

interface FDTeam  { name: string; shortName: string; tla: string }
interface FDScoreVal { home: number | null; away: number | null }
interface FDScore {
  fullTime:    FDScoreVal;
  regularTime: FDScoreVal | null; // present only for ET/PSO matches — the true 90-min score.
                                   // fullTime is unreliable for these (free tier bug: observed
                                   // fullTime = regularTime + penalties, and it fluctuates between calls).
  extraTime:   FDScoreVal | null; // goals scored only during the ET period (not cumulative)
  penalties:   FDScoreVal | null;
  duration:    string | null;
}
interface FDMatch {
  utcDate: string;
  status: string;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: FDScore;
}

// ── WC 2026 bracket progression ──────────────────────────────────────────────
// Maps each match_number to where its winner (and, for SFs, loser) goes next.
// Source: FIFA official knockout-stage schedule.

type BracketSlot = {
  nextNumber?: number;
  nextStage?: "final" | "third_place";
  slot: "home_team_id" | "away_team_id";
  loser?: true; // SF losers go to 3rd-place match
};

const BRACKET: Record<number, BracketSlot[]> = {
  // Round of 32 → Round of 16 (sequential pairs: M73+M74→M89, M75+M76→M90, …)
  73: [{ nextNumber: 89, slot: "home_team_id" }],
  74: [{ nextNumber: 89, slot: "away_team_id" }],
  75: [{ nextNumber: 90, slot: "home_team_id" }],
  76: [{ nextNumber: 90, slot: "away_team_id" }],
  77: [{ nextNumber: 91, slot: "home_team_id" }],
  78: [{ nextNumber: 91, slot: "away_team_id" }],
  79: [{ nextNumber: 92, slot: "home_team_id" }],
  80: [{ nextNumber: 92, slot: "away_team_id" }],
  81: [{ nextNumber: 93, slot: "home_team_id" }],
  82: [{ nextNumber: 93, slot: "away_team_id" }],
  83: [{ nextNumber: 94, slot: "home_team_id" }],
  84: [{ nextNumber: 94, slot: "away_team_id" }],
  85: [{ nextNumber: 95, slot: "home_team_id" }],
  86: [{ nextNumber: 95, slot: "away_team_id" }],
  87: [{ nextNumber: 96, slot: "home_team_id" }],
  88: [{ nextNumber: 96, slot: "away_team_id" }],
  // Round of 16 → Quarterfinals (sequential pairs: M89+M90→M97, …)
  89: [{ nextNumber: 97, slot: "home_team_id" }],
  90: [{ nextNumber: 97, slot: "away_team_id" }],
  91: [{ nextNumber: 98, slot: "home_team_id" }],
  92: [{ nextNumber: 98, slot: "away_team_id" }],
  93: [{ nextNumber: 99, slot: "home_team_id" }],
  94: [{ nextNumber: 99, slot: "away_team_id" }],
  95: [{ nextNumber: 100, slot: "home_team_id" }],
  96: [{ nextNumber: 100, slot: "away_team_id" }],
  // Quarterfinals → Semifinals (sequential pairs: M97+M98→M101, M99+M100→M102)
  97:  [{ nextNumber: 101, slot: "home_team_id" }],
  98:  [{ nextNumber: 101, slot: "away_team_id" }],
  99:  [{ nextNumber: 102, slot: "home_team_id" }],
  100: [{ nextNumber: 102, slot: "away_team_id" }],
  // Semifinals → Final (winner) + 3rd-place (loser)
  101: [
    { nextStage: "final",       slot: "home_team_id" },
    { nextStage: "third_place", slot: "home_team_id", loser: true },
  ],
  102: [
    { nextStage: "final",       slot: "away_team_id" },
    { nextStage: "third_place", slot: "away_team_id", loser: true },
  ],
};

// ── Cron handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();

  // ── Bracket auto-promotion (runs unconditionally every tick) ─────────────
  // Must run before the early-exit below so it fires even when there are no
  // active matches (e.g. between R32 game days after a match finished >3h ago).
  const { data: finishedKnockouts } = await supabase
    .from("matches")
    .select("match_number, home_team_id, away_team_id, home_score, away_score, home_score_et, away_score_et, penalties_home, penalties_away")
    .in("stage", ["round_of_32", "round_of_16", "quarterfinal", "semifinal"])
    .eq("status", "finished")
    .not("home_team_id", "is", null)
    .not("away_team_id", "is", null)
    .not("match_number", "is", null);

  const { data: knockoutTargets } = await supabase
    .from("matches")
    .select("id, match_number, stage, home_team_id, away_team_id")
    .in("stage", ["round_of_16", "quarterfinal", "semifinal", "final", "third_place"]);

  const targetByNumber = new Map(
    (knockoutTargets ?? []).filter((m) => m.match_number).map((m) => [m.match_number as number, m])
  );
  const targetByStage = new Map(
    (knockoutTargets ?? []).filter((m) => !m.match_number).map((m) => [m.stage as string, m])
  );

  let promoted = 0;

  for (const fin of finishedKnockouts ?? []) {
    const num = fin.match_number as number;
    const progression = BRACKET[num];
    if (!progression) continue;

    let winnerId: string;
    let loserId: string;
    if (fin.penalties_home !== null && fin.penalties_away !== null && fin.penalties_home !== fin.penalties_away) {
      const homeWins = (fin.penalties_home as number) > (fin.penalties_away as number);
      winnerId = homeWins ? fin.home_team_id : fin.away_team_id;
      loserId  = homeWins ? fin.away_team_id : fin.home_team_id;
    } else if (fin.home_score_et !== null && fin.away_score_et !== null) {
      if (fin.home_score_et === fin.away_score_et) continue;
      const homeWins = (fin.home_score_et as number) > (fin.away_score_et as number);
      winnerId = homeWins ? fin.home_team_id : fin.away_team_id;
      loserId  = homeWins ? fin.away_team_id : fin.home_team_id;
    } else {
      if (fin.home_score === null || fin.away_score === null || fin.home_score === fin.away_score) continue;
      const homeWins = (fin.home_score as number) > (fin.away_score as number);
      winnerId = homeWins ? fin.home_team_id : fin.away_team_id;
      loserId  = homeWins ? fin.away_team_id : fin.home_team_id;
    }

    for (const p of progression) {
      const target = p.nextNumber
        ? targetByNumber.get(p.nextNumber)
        : targetByStage.get(p.nextStage!);
      if (!target) continue;
      if (target[p.slot as keyof typeof target]) continue;

      const teamId = p.loser ? loserId : winnerId;
      const { error } = await supabase
        .from("matches")
        .update({ [p.slot]: teamId })
        .eq("id", target.id);
      if (!error) promoted++;
    }
  }

  // Matches we care about: live, recently started, or finished within last 3h
  const since = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const { data: dbMatches } = await supabase
    .from("matches")
    .select("id, stage, status, home_score, away_score, score_duration, penalties_home, scheduled_at, home_team:home_team_id(name), away_team:away_team_id(name)")
    .or(
      `status.eq.live,` +
      `and(status.eq.scheduled,scheduled_at.lte.${now.toISOString()}),` +
      `and(status.eq.finished,updated_at.gte.${since})`
    );

  if (!dbMatches?.length) return Response.json({ synced: 0, scored: 0, promoted });

  // One API call: yesterday + today to handle UTC edge cases
  const dateFrom = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const dateTo   = now.toISOString().slice(0, 10);

  const fdRes = await fetch(
    `${FD_BASE}/competitions/WC/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
    { headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY! } }
  );

  if (!fdRes.ok) {
    const text = await fdRes.text();
    return Response.json({ error: `football-data.org ${fdRes.status}: ${text}` }, { status: 502 });
  }

  const fdMatches: FDMatch[] = (await fdRes.json()).matches ?? [];

  let synced = 0;
  let scored = 0;

  for (const db of dbMatches) {
    const homeName = (db.home_team as unknown as { name: string } | null)?.name;
    const awayName = (db.away_team as unknown as { name: string } | null)?.name;
    if (!homeName || !awayName) continue;

    // Match by full name, short name, or 3-letter code
    const fd = fdMatches.find((m) =>
      (teamsMatch(m.homeTeam.name, homeName) || teamsMatch(m.homeTeam.shortName, homeName) || teamsMatch(m.homeTeam.tla, homeName)) &&
      (teamsMatch(m.awayTeam.name, awayName) || teamsMatch(m.awayTeam.shortName, awayName) || teamsMatch(m.awayTeam.tla, awayName))
    );

    if (!fd) continue;

    const apiStatus    = mapStatus(fd.status);
    // regularTime is the reliable 90-min score for ET/PSO matches; fullTime is only
    // trustworthy when there's no regularTime (i.e. the match never went past 90 min).
    const homeScore    = fd.score?.regularTime?.home ?? fd.score?.fullTime?.home ?? null;
    const awayScore    = fd.score?.regularTime?.away ?? fd.score?.fullTime?.away ?? null;
    // extraTime holds goals scored only during the ET period — add to regulation for the
    // cumulative post-ET score (used for AET display and bracket-winner determination).
    const etGoalsHome  = fd.score?.extraTime?.home ?? null;
    const etGoalsAway  = fd.score?.extraTime?.away ?? null;
    const homeScoreEt  = (homeScore !== null && etGoalsHome !== null) ? homeScore + etGoalsHome : null;
    const awayScoreEt  = (awayScore !== null && etGoalsAway !== null) ? awayScore + etGoalsAway : null;
    // Free tier doesn't capture sudden-death kicks — a tied value means the data is
    // incomplete, not that the shootout was a draw. Treat tied penalties as unknown.
    const penHomeRaw   = fd.score?.penalties?.home ?? null;
    const penAwayRaw   = fd.score?.penalties?.away ?? null;
    const penTied      = penHomeRaw !== null && penAwayRaw !== null && penHomeRaw === penAwayRaw;
    const penHome      = penTied ? null : penHomeRaw;
    const penAway      = penTied ? null : penAwayRaw;
    const duration     = fd.score?.duration ?? null;

    // If kickoff has passed but API still says scheduled (TIMED), treat as live
    const kickoffPassed = new Date(db.scheduled_at) <= now;
    const status = (apiStatus === "scheduled" && kickoffPassed) ? "live" : apiStatus;

    // Never regress status
    const STATUS_RANK: Record<string, number> = { scheduled: 0, live: 1, finished: 2 };
    if ((STATUS_RANK[status] ?? 0) < (STATUS_RANK[db.status] ?? 0)) continue;

    if (status === "finished" && homeScore !== null && awayScore !== null) {
      // Write regulation score + ET/pen scores + status together.
      // Also re-writes when AET/pen data arrives after the match was already
      // marked finished on regulation score alone (football-data.org can lag).
      const dbCast = db as unknown as { score_duration: string | null; penalties_home: number | null };
      const durationChanged = duration !== null && duration !== dbCast.score_duration;
      // Catches the case where the API initially returned tied/null penalties but later corrects them
      const penChanged = penHome !== null && penHome !== dbCast.penalties_home;
      if (db.status !== "finished" || db.home_score !== homeScore || db.away_score !== awayScore || durationChanged || penChanged) {
        await supabase
          .from("matches")
          .update({
            status,
            home_score: homeScore, away_score: awayScore,
            home_score_et: homeScoreEt, away_score_et: awayScoreEt,
            penalties_home: penHome,   penalties_away: penAway,
            score_duration: duration,
            updated_at: now.toISOString(),
          })
          .eq("id", db.id);
        synced++;
      }
    } else if (status !== db.status) {
      // Only update status — never touch the score during a live match
      await supabase
        .from("matches")
        .update({ status, updated_at: now.toISOString() })
        .eq("id", db.id);
      synced++;
    }

    // Score predictions once the match finishes.
    // If the score changed (API correction of an earlier stale value), rescore ALL predictions
    // for this match so previously wrong scores get fixed. Otherwise only score new/unscored ones.
    if (status === "finished" && homeScore !== null && awayScore !== null) {
      const scoreChanged = db.status !== "finished" || db.home_score !== homeScore || db.away_score !== awayScore;

      let predsQuery = supabase
        .from("predictions")
        .select("id, pred_home, pred_away")
        .eq("match_id", db.id);
      if (!scoreChanged) predsQuery = predsQuery.is("points_earned", null);

      const { data: preds } = await predsQuery;

      if (preds?.length) {
        await Promise.all(
          preds.map((pred) => {
            const pts = calculateMatchPoints(
              pred.pred_home, pred.pred_away,
              homeScore, awayScore,
              db.stage as Stage
            );
            return supabase.from("predictions").update({ points_earned: pts }).eq("id", pred.id);
          })
        );
        scored += preds.length;
      }
    }
  }

  // Invalidate the scorers page cache whenever matches are active — scorers can
  // change during a live match even when our DB score hasn't updated yet.
  // { expire: 0 } = immediate expiration in Next.js 16 (expire: N extends cache life).
  revalidateTag("scorers", { expire: 0 });

  return Response.json({ synced, scored, checked: dbMatches.length, promoted });
}

