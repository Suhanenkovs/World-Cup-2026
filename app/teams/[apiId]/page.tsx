import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getFlagUrl } from "@/lib/teamFlags";
import { formatInTimeZone } from "date-fns-tz";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import type { MatchWithTeams } from "@/types/database";
import Link from "next/link";
import { BackButton } from "@/components/BackButton";

export const revalidate = 86400;

// ── football-data.org types ────────────────────────────────────────────────

interface FDScorer {
  player: { id: number; name: string };
  team: { id: number; name: string };
  goals: number;
  assists: number | null;
  penalties: number | null;
}

// football-data.org uses different name variants than our DB
const FD_NAME_ALIASES: Record<string, string[]> = {
  "South Korea":          ["Korea Republic", "Republic of Korea"],
  "Turkey":               ["Türkiye"],
  "Ivory Coast":          ["Côte d'Ivoire", "Cote d'Ivoire"],
  "Cape Verde":           ["Cabo Verde"],
  "Iran":                 ["IR Iran"],
  "USA":                  ["United States", "United States of America"],
  "DR Congo":             ["Congo DR", "Democratic Republic of the Congo"],
  "Bosnia & Herzegovina": ["Bosnia and Herzegovina", "Bosnia-Herzegovina"],
};

function matchesTeamName(fdName: string, dbName: string): boolean {
  if (fdName === dbName) return true;
  return (FD_NAME_ALIASES[dbName] ?? []).includes(fdName);
}

async function fetchScorers(): Promise<FDScorer[]> {
  try {
    const res = await fetch("https://api.football-data.org/v4/competitions/WC/scorers?limit=100", {
      headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY! },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.scorers ?? [];
  } catch { return []; }
}

// ── Sub-components ─────────────────────────────────────────────────────────

function MatchRow({ match, teamApiId }: { match: MatchWithTeams; teamApiId: string }) {
  const kickoff   = new Date(match.scheduled_at);
  const hasScore  = match.home_score !== null;
  const isHome    = match.home_team?.api_id === teamApiId;
  const opponent  = isHome ? match.away_team : match.home_team;
  const oppFlag   = (opponent ? getFlagUrl(opponent.name) : null) ?? opponent?.flag_url ?? null;
  const teamScore = isHome ? match.home_score : match.away_score;
  const oppScore  = isHome ? match.away_score : match.home_score;

  const resultColor = !hasScore ? "" :
    teamScore! > oppScore!  ? "text-emerald-400" :
    teamScore! < oppScore!  ? "text-red-400" : "text-gray-300";

  return (
    <Link
      href={`/matches/${match.id}`}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
    >
      <span className="text-gray-500 text-xs w-28 shrink-0">
        {formatInTimeZone(kickoff, "Europe/Riga", "d MMM · HH:mm")}
      </span>
      <span className="text-[10px] text-gray-600 w-6 shrink-0 text-center font-mono">
        {isHome ? "H" : "A"}
      </span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        {oppFlag
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={oppFlag} alt={opponent?.name ?? ""} className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />
          : <span className="w-5 h-3.5 bg-gray-700 rounded-sm shrink-0 inline-block" />
        }
        <span className="text-white text-sm truncate">{opponent?.name ?? "TBD"}</span>
      </div>
      <div className="shrink-0 text-right">
        {hasScore ? (
          <span className={`font-mono font-bold text-sm ${resultColor}`}>
            {teamScore} – {oppScore}
          </span>
        ) : (
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            {match.status === "live" ? <span className="text-red-400 animate-pulse">LIVE</span> : "–"}
          </span>
        )}
      </div>
      <span className="text-[10px] text-gray-600 w-16 shrink-0 text-right hidden sm:block">
        {STAGE_LABELS[match.stage as Stage] ?? match.stage}
        {match.group_letter ? ` ${match.group_letter}` : ""}
      </span>
    </Link>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function TeamPage({
  params,
}: {
  params: Promise<{ apiId: string }>;
}) {
  const { apiId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: dbTeam }, allScorers] = await Promise.all([
    supabase.from("teams").select("*").eq("api_id", apiId).maybeSingle(),
    fetchScorers(),
  ]);

  if (!dbTeam) notFound();

  const teamName = dbTeam.name;
  const flagSrc  = getFlagUrl(teamName) ?? dbTeam.flag_url;

  // Fetch this team's WC matches from our DB
  const { data: matchRows } = await supabase
    .from("matches")
    .select("*, home_team:home_team_id(*), away_team:away_team_id(*)")
    .or(`home_team_id.eq.${dbTeam.id},away_team_id.eq.${dbTeam.id}`)
    .order("scheduled_at", { ascending: true });

  const matches = (matchRows ?? []) as MatchWithTeams[];

  // Filter scorers by team name (FD uses different IDs than our DB)
  const teamScorers = allScorers.filter((s) => matchesTeamName(s.team.name, teamName));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      <BackButton />

      {/* Team header */}
      <div className="flex items-center gap-5 mb-8">
        {flagSrc
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={flagSrc} alt={teamName} loading="lazy" className="w-20 h-14 object-cover rounded-xl border border-white/10 shadow-lg shrink-0" />
          : <span className="w-20 h-14 rounded-xl bg-gray-800 shrink-0 inline-block" />
        }
        <div>
          <h1 className="text-3xl font-bold text-white">{teamName}</h1>
          {dbTeam.group_letter && (
            <div className="mt-1 text-sm text-gray-400">Group {dbTeam.group_letter}</div>
          )}
        </div>
      </div>

      {/* Matches */}
      {matches.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
            World Cup 2026 Matches
          </h2>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            {matches.map((m) => (
              <MatchRow key={m.id} match={m} teamApiId={apiId} />
            ))}
          </div>
        </div>
      )}

      {/* Goal contributors */}
      {teamScorers.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">
            Goal Contributors
          </h2>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <th className="px-4 py-2 text-left">Player</th>
                  <th className="px-4 py-2 text-right w-12">Goals</th>
                  <th className="px-4 py-2 text-right w-12">Assists</th>
                  <th className="px-4 py-2 text-right w-12">Pen</th>
                </tr>
              </thead>
              <tbody>
                {teamScorers.map((s, i) => (
                  <tr key={s.player.id} className={`border-b border-white/5 last:border-0 ${i % 2 !== 0 ? "bg-white/[0.02]" : ""}`}>
                    <td className="px-4 py-2.5 text-white font-medium">{s.player.name}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-emerald-400">{s.goals}</td>
                    <td className="px-4 py-2.5 text-right text-gray-300">{s.assists ?? 0}</td>
                    <td className="px-4 py-2.5 text-right text-gray-500">{s.penalties ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {matches.length === 0 && teamScorers.length === 0 && (
        <p className="text-gray-500 text-sm">No tournament data available yet.</p>
      )}

    </div>
  );
}
