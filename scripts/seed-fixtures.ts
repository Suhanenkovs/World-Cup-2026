/**
 * Seed script: pulls WC 2026 teams from BALLDONTLIE and matches from
 * openfootball (free, no auth required for either matches source).
 *
 * Usage:
 *   npm run seed
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const API_KEY = process.env.BALLDONTLIE_API_KEY!;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase = createClient<any>(SUPABASE_URL, SERVICE_KEY);

// ── openfootball round → our stage key ────────────────────────────────────
const STAGE_MAP: Record<string, string> = {
  "Round of 32":          "round_of_32",
  "Round of 16":          "round_of_16",
  "Quarter-final":        "quarterfinal",
  "Semi-final":           "semifinal",
  "Match for third place":"third_place",
  "Final":                "final",
};

// Known name differences between BALLDONTLIE and openfootball
const NAME_ALIASES: Record<string, string[]> = {
  "United States":  ["USA", "United States of America"],
  "Iran":           ["IR Iran"],
  "South Korea":    ["Korea Republic", "Republic of Korea"],
  "Czechia":        ["Czech Republic"],
  "Ivory Coast":    ["Côte d'Ivoire", "Cote d'Ivoire"],
  "DR Congo":       ["Congo DR", "Democratic Republic of the Congo"],
  "Turkey":         ["Türkiye"],
  "Türkiye":        ["Turkey"],
  "Bosnia and Herzegovina": ["Bosnia & Herzegovina", "Bosnia-Herzegovina"],
  "Curaçao":        ["Curacao"],
  "Cape Verde":     ["Cabo Verde"],
};

// ── BALLDONTLIE: fetch teams ──────────────────────────────────────────────
async function fetchBallDontLieTeams() {
  const results: Record<string, unknown>[] = [];
  let cursor: string | null = null;
  const BASE = "https://api.balldontlie.io/fifa/worldcup/v1";
  const HEADERS = { Authorization: `Bearer ${API_KEY}` };
  do {
    const url = new URL(`${BASE}/teams`);
    url.searchParams.set("seasons[]", "2026");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url.toString(), { headers: HEADERS });
    if (!res.ok) throw new Error(`BALLDONTLIE ${res.status} — ${url}`);
    const json = await res.json();
    results.push(...(json.data ?? []));
    cursor = json.meta?.next_cursor ?? null;
  } while (cursor);
  return results;
}

async function seedTeams() {
  console.log("Fetching teams from BALLDONTLIE…");
  const teams = await fetchBallDontLieTeams();
  console.log(`  Got ${teams.length} teams`);
  for (const t of teams) {
    const row = {
      api_id:       String((t as any).id),
      name:         (t as any).name as string,
      short_name:   ((t as any).short_name as string) ?? ((t as any).name as string).slice(0, 3).toUpperCase(),
      flag_url:     (t as any).flag_url ?? null,
      group_letter: (t as any).group ?? null,
    };
    const { error } = await supabase.from("teams").upsert(row, { onConflict: "api_id" });
    if (error) console.error("  team error:", error.message, row.name);
  }
  console.log("  Teams seeded.");
}

// ── openfootball: fetch + seed matches ───────────────────────────────────
function parseScheduledAt(date: string, time: string): string {
  // time looks like "13:00 UTC-6" or "20:00 UTC-4"
  // UTC-6 means local is 6h behind UTC → UTC = local + 6h
  const [hhmm, utcPart] = time.split(" ");
  const [hh, mm] = hhmm.split(":").map(Number);
  const offsetMatch = utcPart?.match(/UTC([+-]\d+(?:\.\d+)?)/);
  const offsetHours = offsetMatch ? parseFloat(offsetMatch[1]) : 0;

  const localMinutes = hh * 60 + mm;
  const utcMinutes = localMinutes - offsetHours * 60; // subtract offset to get UTC

  const [year, month, day] = date.split("-").map(Number);
  const baseMsUTC = Date.UTC(year, month - 1, day);
  const utcMs = baseMsUTC + utcMinutes * 60 * 1000;

  return new Date(utcMs).toISOString();
}

function buildNameMap(teamRows: { id: string; name: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of teamRows) {
    map.set(t.name.toLowerCase(), t.id);
    // Also index aliases
    for (const [canonical, aliases] of Object.entries(NAME_ALIASES)) {
      if (t.name === canonical) {
        for (const alias of aliases) map.set(alias.toLowerCase(), t.id);
      }
      for (const alias of aliases) {
        if (t.name === alias) map.set(canonical.toLowerCase(), t.id);
      }
    }
  }
  return map;
}

async function seedMatches() {
  console.log("Fetching matches from openfootball…");
  const res = await fetch(
    "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json"
  );
  if (!res.ok) throw new Error(`openfootball fetch failed: ${res.status}`);
  const json = await res.json();
  const matches: any[] = json.matches ?? [];
  console.log(`  Got ${matches.length} matches`);

  const { data: teamRows } = await supabase.from("teams").select("id, name");
  const nameMap = buildNameMap(teamRows ?? []);

  let ok = 0, skipped = 0;
  for (const m of matches) {
    const round: string = m.round ?? "";
    const stage = round.startsWith("Matchday")
      ? "group"
      : (STAGE_MAP[round] ?? "group");

    const groupLetter = m.group
      ? (m.group as string).replace("Group ", "")
      : null;

    // Team names are strings in group stage; placeholders in knockout
    const homeId = nameMap.get((m.team1 ?? "").toLowerCase()) ?? null;
    const awayId = nameMap.get((m.team2 ?? "").toLowerCase()) ?? null;

    const apiId = m.num
      ? `of-${m.num}`
      : `of-${stage}-${m.date}-${(m.team1 ?? "").replace(/\s/g, "")}-${(m.team2 ?? "").replace(/\s/g, "")}`;

    let scheduledAt: string;
    try {
      scheduledAt = parseScheduledAt(m.date, m.time ?? "12:00 UTC+0");
    } catch {
      scheduledAt = `${m.date}T12:00:00Z`;
    }

    const row = {
      api_id:       apiId,
      match_number: m.num ?? null,
      stage,
      group_letter: groupLetter,
      home_team_id: homeId,
      away_team_id: awayId,
      home_score:   null,
      away_score:   null,
      scheduled_at: scheduledAt,
      venue:        m.ground ?? null,
      status:       "scheduled" as const,
    };

    const { error } = await supabase.from("matches").upsert(row, { onConflict: "api_id" });
    if (error) {
      console.error("  match error:", error.message, apiId);
      skipped++;
    } else {
      ok++;
    }
  }
  console.log(`  Matches seeded: ${ok} ok, ${skipped} errors.`);
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing SUPABASE env vars.");
    process.exit(1);
  }
  await seedTeams();
  await seedMatches();
  console.log("Done.");
}

main().catch((err) => { console.error(err); process.exit(1); });
