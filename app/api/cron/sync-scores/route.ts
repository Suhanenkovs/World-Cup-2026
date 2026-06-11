import { NextRequest } from "next/server";
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
interface FDScore { fullTime: { home: number | null; away: number | null } }
interface FDMatch { status: string; homeTeam: FDTeam; awayTeam: FDTeam; score: FDScore }

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

    const status    = mapStatus(fd.status);
    const homeScore = fd.score?.fullTime?.home ?? null;
    const awayScore = fd.score?.fullTime?.away ?? null;

    // Never regress: don't downgrade status or wipe a score the API momentarily lost
    const STATUS_RANK: Record<string, number> = { scheduled: 0, live: 1, finished: 2 };
    if ((STATUS_RANK[status] ?? 0) < (STATUS_RANK[db.status] ?? 0)) continue;
    if (homeScore === null && db.home_score !== null) continue;

    const changed =
      db.status     !== status    ||
      db.home_score !== homeScore ||
      db.away_score !== awayScore;

    if (changed) {
      await supabase
        .from("matches")
        .update({ status, home_score: homeScore, away_score: awayScore, updated_at: now.toISOString() })
        .eq("id", db.id);
      synced++;
    }

    // Score predictions once the match finishes
    if (status === "finished" && homeScore !== null && awayScore !== null) {
      const { data: preds } = await supabase
        .from("predictions")
        .select("id, pred_home, pred_away")
        .eq("match_id", db.id)
        .is("points_earned", null);

      for (const pred of preds ?? []) {
        const pts = calculateMatchPoints(
          pred.pred_home, pred.pred_away,
          homeScore, awayScore,
          db.stage as Stage
        );
        await supabase.from("predictions").update({ points_earned: pts }).eq("id", pred.id);
        scored++;
      }
    }
  }

  return Response.json({ synced, scored, checked: dbMatches.length });
}

