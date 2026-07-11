import { createClient } from "@/lib/supabase/server";
import { getFlagUrl } from "@/lib/teamFlags";
import { getTeamTLA } from "@/lib/teamTLA";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import type { MatchWithTeams } from "@/types/database";
import AutoRefresh from "@/components/AutoRefresh";

export const revalidate = 60;

// â”€â”€ Standings computed from DB finished matches only â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface StandingRow {
  teamId: string;
  teamName: string;
  apiId: string | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

function computeStandings(groupMatches: MatchWithTeams[]): StandingRow[] {
  const rows = new Map<string, StandingRow>();

  // Initialise every team in this group (from all matches, not just finished)
  for (const m of groupMatches) {
    for (const team of [m.home_team, m.away_team]) {
      if (team && !rows.has(team.id)) {
        rows.set(team.id, {
          teamId: team.id,
          teamName: team.name,
          apiId: team.api_id,
          played: 0, won: 0, draw: 0, lost: 0,
          goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
        });
      }
    }
  }

  // Only count finished matches
  for (const m of groupMatches) {
    if (m.status !== "finished" || m.home_score === null || m.away_score === null) continue;
    if (!m.home_team || !m.away_team) continue;

    const home = rows.get(m.home_team.id)!;
    const away = rows.get(m.away_team.id)!;

    home.played++; away.played++;
    home.goalsFor     += m.home_score; home.goalsAgainst += m.away_score;
    away.goalsFor     += m.away_score; away.goalsAgainst += m.home_score;

    if (m.home_score > m.away_score)      { home.won++; home.points += 3; away.lost++; }
    else if (m.home_score < m.away_score) { away.won++; away.points += 3; home.lost++; }
    else                                  { home.draw++; home.points++; away.draw++; away.points++; }

    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;
  }

  return [...rows.values()].sort((a, b) =>
    b.points - a.points || b.goalDifference - a.goalDifference || b.goalsFor - a.goalsFor
  );
}

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StandingsTable({ rows }: { rows: StandingRow[] }) {
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
          const flagSrc = getFlagUrl(row.teamName);
          const qualifies = i < 2;
          return (
            <tr
              key={row.teamId}
              className={`border-b border-gray-800/50 ${qualifies ? "bg-emerald-950/20" : ""}`}
            >
              <td className="py-1.5 pl-1 text-gray-500">{i + 1}</td>
              <td className="py-1.5">
                {row.apiId ? (
                  <Link href={`/teams/${row.apiId}`} className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group">
                    {flagSrc
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={flagSrc} alt={row.teamName} loading="lazy" className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />
                      : <span className="w-5 h-3.5 rounded-sm bg-gray-700 shrink-0 inline-block" />
                    }
                    <span className="text-white font-medium truncate group-hover:text-amber-400 transition-colors">{row.teamName}</span>
                  </Link>
                ) : (
                  <div className="flex items-center gap-1.5">
                    {flagSrc
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={flagSrc} alt={row.teamName} loading="lazy" className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />
                      : <span className="w-5 h-3.5 rounded-sm bg-gray-700 shrink-0 inline-block" />
                    }
                    <span className="text-white font-medium truncate">{row.teamName}</span>
                  </div>
                )}
              </td>
              <td className="py-1.5 text-center text-gray-400">{row.played}</td>
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
        const homeFlagSrc = (m.home_team ? getFlagUrl(m.home_team.name) : null) ?? m.home_team?.flag_url ?? null;
        const awayFlagSrc = (m.away_team ? getFlagUrl(m.away_team.name) : null) ?? m.away_team?.flag_url ?? null;
        const isLive = m.status === "live";
        return (
          <Link
            key={m.id}
            href={`/matches/${m.id}`}
            className="flex items-center px-2 py-1.5 rounded-lg hover:bg-gray-800/60 transition-colors"
          >
            {/* Date â€” flush left, aligned with table */}
            <span className="text-gray-500 text-[10px] shrink-0">{formatInTimeZone(kickoff, "Europe/Riga", "d MMM HH:mm")}</span>

            {/* Spacer pushes match content to the right */}
            <div className="flex-1" />

            {/* Match content â€” fixed widths keep flags aligned across rows */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Home: TLA + flag, right-aligned, fixed width */}
              <div className="flex items-center justify-end gap-1 w-14">
                <span className="text-white font-mono text-[11px]">{getTeamTLA(m.home_team?.name)}</span>
                {homeFlagSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={homeFlagSrc} alt="" loading="lazy" className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />
                  : <span className="w-5 h-3.5 bg-gray-700 rounded-sm inline-block shrink-0" />
                }
              </div>

              {/* Score / VS */}
              <div className="flex flex-col items-center gap-0.5 w-10">
                {isLive && (
                  <span className="text-[8px] bg-red-600 text-white px-1 py-0.5 rounded-full animate-pulse leading-none">LIVE</span>
                )}
                {hasScore ? (
                  <span className={`font-mono font-bold text-xs ${isLive ? "text-emerald-400" : "text-white"}`}>
                    {m.home_score}â€“{m.away_score}
                  </span>
                ) : !isLive ? (
                  <span className="text-gray-600 text-xs">vs</span>
                ) : null}
              </div>

              {/* Away: flag + TLA, left-aligned, fixed width */}
              <div className="flex items-center justify-start gap-1 w-14">
                {awayFlagSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={awayFlagSrc} alt="" loading="lazy" className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />
                  : <span className="w-5 h-3.5 bg-gray-700 rounded-sm inline-block shrink-0" />
                }
                <span className="text-white font-mono text-[11px]">{getTeamTLA(m.away_team?.name)}</span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default async function GroupsPage() {
  const supabase = await createClient();

  const { data: matches } = await supabase
    .from("matches")
    .select("*, home_team:home_team_id(*), away_team:away_team_id(*)")
    .eq("stage", "group")
    .order("scheduled_at", { ascending: true });

  const allMatches = (matches ?? []) as MatchWithTeams[];
  const hasLive = allMatches.some((m) => m.status === "live");

  // Bucket by group letter
  const matchesByGroup = new Map<string, MatchWithTeams[]>();
  for (const m of allMatches) {
    if (!m.group_letter) continue;
    const list = matchesByGroup.get(m.group_letter) ?? [];
    list.push(m);
    matchesByGroup.set(m.group_letter, list);
  }

  const groupLetters = [...matchesByGroup.keys()].sort();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {hasLive && <AutoRefresh />}
      <h1 className="text-2xl font-bold text-white mb-6">Group Stage</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {groupLetters.map((letter) => {
          const groupMatches = matchesByGroup.get(letter)!;
          const standings = computeStandings(groupMatches);
          return (
            <div key={letter} className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
              <h2 className="text-xs font-bold uppercase tracking-widest text-emerald-400 mb-3">
                Group {letter}
              </h2>
              <StandingsTable rows={standings} />
              <GroupFixtures matches={groupMatches} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
