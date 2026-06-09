import { createClient } from "@/lib/supabase/server";
import { getFlagUrl } from "@/lib/teamFlags";
import { getTeamTLA } from "@/lib/teamTLA";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import type { MatchWithTeams } from "@/types/database";

export const revalidate = 60;

// ── football-data.org types ───────────────────────────────────────────────────

interface FDTeam { id: number; name: string; shortName: string; tla: string; crest: string }
interface FDTableRow {
  position: number;
  team: FDTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
interface FDGroup { group: string; table: FDTableRow[]; type: string }

async function fetchStandings(): Promise<FDGroup[]> {
  try {
    const res = await fetch("https://api.football-data.org/v4/competitions/WC/standings", {
      headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY! },
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.standings as FDGroup[]).filter((s: { type: string }) => s.type === "TOTAL");
  } catch {
    return [];
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StandingsTable({ rows }: { rows: FDTableRow[] }) {
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-gray-500 border-b border-gray-800">
          <th className="text-left py-1 pl-1 font-medium w-6">#</th>
          <th className="text-left py-1 font-medium">Team</th>
          <th className="text-center py-1 font-medium w-7">P</th>
          <th className="text-center py-1 font-medium w-7">W</th>
          <th className="text-center py-1 font-medium w-7">D</th>
          <th className="text-center py-1 font-medium w-7">L</th>
          <th className="text-center py-1 font-medium w-8">GD</th>
          <th className="text-center py-1 font-medium w-8 text-emerald-400">Pts</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const flagSrc = getFlagUrl(row.team.name) ?? getFlagUrl(row.team.shortName);
          const qualifies = i < 2;
          return (
            <tr
              key={row.team.tla}
              className={`border-b border-gray-800/50 ${qualifies ? "bg-emerald-950/20" : ""}`}
            >
              <td className="py-1.5 pl-1 text-gray-500">{row.position}</td>
              <td className="py-1.5">
                <Link href={`/teams/${row.team.id}`} className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group">
                  {flagSrc
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={flagSrc} alt={row.team.name} className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />
                    : <span className="w-5 h-3.5 rounded-sm bg-gray-700 shrink-0 inline-block" />
                  }
                  <span className="text-white font-medium truncate group-hover:text-amber-400 transition-colors">{row.team.shortName}</span>
                </Link>
              </td>
              <td className="py-1.5 text-center text-gray-400">{row.playedGames}</td>
              <td className="py-1.5 text-center text-gray-400">{row.won}</td>
              <td className="py-1.5 text-center text-gray-400">{row.draw}</td>
              <td className="py-1.5 text-center text-gray-400">{row.lost}</td>
              <td className="py-1.5 text-center text-gray-400">
                {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
              </td>
              <td className="py-1.5 text-center font-bold text-emerald-400">{row.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function GroupFixtures({ matches }: { matches: MatchWithTeams[] }) {
  if (!matches.length) return null;
  return (
    <div className="mt-3 flex flex-col gap-1">
      {matches.map((m) => {
        const kickoff = new Date(m.scheduled_at);
        const hasScore = m.home_score !== null;
        const homeFlagSrc = m.home_team?.flag_url ?? (m.home_team ? getFlagUrl(m.home_team.name) : null);
        const awayFlagSrc = m.away_team?.flag_url ?? (m.away_team ? getFlagUrl(m.away_team.name) : null);
        const isLive = m.status === "live";
        return (
          <Link
            key={m.id}
            href={`/matches/${m.id}`}
            className="grid grid-cols-[64px_1fr_44px_1fr] items-center gap-x-1 px-2 py-1.5 rounded-lg hover:bg-gray-800/60 transition-colors"
          >
            <span className="text-gray-500 text-[10px]">{formatInTimeZone(kickoff, "Europe/Riga", "d MMM HH:mm")}</span>

            <div className="flex items-center justify-end gap-1">
              <span className="text-white font-mono text-[11px]">{getTeamTLA(m.home_team?.name)}</span>
              {homeFlagSrc
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={homeFlagSrc} alt="" className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />
                : <span className="w-5 h-3.5 bg-gray-700 rounded-sm shrink-0 inline-block" />
              }
            </div>

            <div className="text-center text-xs">
              {hasScore ? (
                <span className={`font-mono font-bold ${isLive ? "text-emerald-400" : "text-white"}`}>
                  {m.home_score}–{m.away_score}
                </span>
              ) : isLive ? (
                <span className="text-[9px] bg-red-600 text-white px-1 py-0.5 rounded-full animate-pulse">LIVE</span>
              ) : (
                <span className="text-gray-600">vs</span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {awayFlagSrc
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={awayFlagSrc} alt="" className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />
                : <span className="w-5 h-3.5 bg-gray-700 rounded-sm shrink-0 inline-block" />
              }
              <span className="text-white font-mono text-[11px]">{getTeamTLA(m.away_team?.name)}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function GroupsPage() {
  const supabase = await createClient();

  const [fdGroups, { data: matches }] = await Promise.all([
    fetchStandings(),
    supabase
      .from("matches")
      .select("*, home_team:home_team_id(*), away_team:away_team_id(*)")
      .eq("stage", "group")
      .order("scheduled_at", { ascending: true }),
  ]);

  // Bucket DB matches by group letter
  const matchesByGroup = new Map<string, MatchWithTeams[]>();
  for (const m of (matches ?? []) as MatchWithTeams[]) {
    if (!m.group_letter) continue;
    const list = matchesByGroup.get(m.group_letter) ?? [];
    list.push(m);
    matchesByGroup.set(m.group_letter, list);
  }

  // Sort groups A–L
  const groups = fdGroups.sort((a, b) => a.group.localeCompare(b.group));
  const groupLetters = groups.map((g) => g.group.replace(/^GROUP[_ ]?/i, ""));

  // Fallback: if FD standings not available yet, show groups from DB only
  const dbOnlyLetters = [...matchesByGroup.keys()]
    .filter((l) => !groupLetters.includes(l))
    .sort();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Group Stage</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {groups.map((g) => {
          const letter = g.group.replace(/^GROUP[_ ]?/i, "");
          return (
            <div key={g.group} className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-3">
                Group {letter}
              </h2>
              <StandingsTable rows={g.table} />
              <GroupFixtures matches={matchesByGroup.get(letter) ?? []} />
            </div>
          );
        })}

        {/* Fallback cards when standings API not yet populated */}
        {dbOnlyLetters.map((letter) => (
          <div key={letter} className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-3">
              Group {letter}
            </h2>
            <p className="text-xs text-gray-600 mb-2">Standings available at tournament start</p>
            <GroupFixtures matches={matchesByGroup.get(letter) ?? []} />
          </div>
        ))}
      </div>
    </div>
  );
}
