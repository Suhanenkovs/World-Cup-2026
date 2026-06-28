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
  fullTime:  FDScoreVal;
  extraTime: FDScoreVal | null;
  penalties: FDScoreVal | null;
  duration:  string | null;
}
interface FDMatch {
  utcDate: string;
  status: string;
  homeTeam: FDTeam;
  awayTeam: FDTeam;
  score: FDScore;
}

// ── Cron handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  if (request.headers.get("Authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const now = new Date();

  // Matches we care about: live, recently started, or finished within last 3h
  const since = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const { data: dbMatches } = await supabase
    .from("matches")
    .select("id, stage, status, home_score, away_score, scheduled_at, home_team:home_team_id(name), away_team:away_team_id(name)")
    .or(
      `status.eq.live,` +
      `and(status.eq.scheduled,scheduled_at.lte.${now.toISOString()}),` +
      `and(status.eq.finished,updated_at.gte.${since})`
    );

  if (!dbMatches?.length) return Response.json({ synced: 0, scored: 0 });

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
    const homeScore    = fd.score?.fullTime?.home  ?? null;  // regulation (90 min)
    const awayScore    = fd.score?.fullTime?.away  ?? null;
    const homeScoreEt  = fd.score?.extraTime?.home ?? null;
    const awayScoreEt  = fd.score?.extraTime?.away ?? null;
    const penHome      = fd.score?.penalties?.home ?? null;
    const penAway      = fd.score?.penalties?.away ?? null;
    const duration     = fd.score?.duration ?? null;

    // If kickoff has passed but API still says scheduled (TIMED), treat as live
    const kickoffPassed = new Date(db.scheduled_at) <= now;
    const status = (apiStatus === "scheduled" && kickoffPassed) ? "live" : apiStatus;

    // Never regress status
    const STATUS_RANK: Record<string, number> = { scheduled: 0, live: 1, finished: 2 };
    if ((STATUS_RANK[status] ?? 0) < (STATUS_RANK[db.status] ?? 0)) continue;

    if (status === "finished" && homeScore !== null && awayScore !== null) {
      // Write regulation score + ET/pen scores + status together
      if (db.status !== "finished" || db.home_score !== homeScore || db.away_score !== awayScore) {
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

  if (synced > 0) revalidateTag("scorers", { expire: 86400 });

  // ── Sync knockout team assignments ────────────────────────────────────────
  // Runs only when there are future knockout matches with null teams in the DB.
  // Makes one API call covering the remaining tournament to fill them in as
  // football-data.org publishes the teams for each round.
  const KNOCKOUT_STAGES = ["round_of_32", "round_of_16", "quarterfinal", "semifinal", "third_place", "final"];
  const { data: missingTeamMatches } = await supabase
    .from("matches")
    .select("id, scheduled_at")
    .in("stage", KNOCKOUT_STAGES)
    .or("home_team_id.is.null,away_team_id.is.null")
    .gt("scheduled_at", now.toISOString())
    .limit(1);

  let teamsAssigned = 0;
  if (missingTeamMatches?.length) {
    const knockoutRes = await fetch(
      `${FD_BASE}/competitions/WC/matches?dateFrom=${now.toISOString().slice(0, 10)}&dateTo=2026-07-20`,
      { headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY! } }
    );
    if (knockoutRes.ok) {
      const allFuture: FDMatch[] = (await knockoutRes.json()).matches ?? [];

      // Fetch teams table for name → id lookup
      const { data: allTeams } = await supabase.from("teams").select("id, name");
      const teamByNorm = new Map((allTeams ?? []).map((t) => [normalize(t.name), t.id]));
      const resolveTeam = (fdTeam: FDTeam): string | null => {
        if (!fdTeam?.name) return null;
        return (
          teamByNorm.get(normalize(fdTeam.name)) ??
          teamByNorm.get(normalize(fdTeam.shortName ?? "")) ??
          teamByNorm.get(normalize(fdTeam.tla ?? "")) ??
          null
        );
      };

      // Fetch all knockout matches with null teams from DB
      const { data: nullTeamMatches } = await supabase
        .from("matches")
        .select("id, scheduled_at, home_team_id, away_team_id")
        .in("stage", KNOCKOUT_STAGES)
        .or("home_team_id.is.null,away_team_id.is.null");

      const dbByTime = new Map(
        (nullTeamMatches ?? []).map((m) => [m.scheduled_at.replace("+00:00", "Z"), m])
      );

      for (const fdM of allFuture) {
        const dbM = dbByTime.get(fdM.utcDate);
        if (!dbM) continue;

        const patch: Record<string, string> = {};
        if (!dbM.home_team_id) {
          const id = resolveTeam(fdM.homeTeam);
          if (id) patch.home_team_id = id;
        }
        if (!dbM.away_team_id) {
          const id = resolveTeam(fdM.awayTeam);
          if (id) patch.away_team_id = id;
        }
        if (!Object.keys(patch).length) continue;

        const { error } = await supabase.from("matches").update(patch).eq("id", dbM.id);
        if (!error) teamsAssigned++;
      }
    }
  }

  return Response.json({ synced, scored, checked: dbMatches.length, teamsAssigned });
}

