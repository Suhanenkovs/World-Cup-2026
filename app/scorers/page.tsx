import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFlagUrl } from "@/lib/teamFlags";
export const dynamic = "force-dynamic";

interface FDScorer {
  player: { id: number; name: string; nationality: string | null };
  team: { id: number; name: string; shortName: string; tla: string };
  goals: number;
  assists: number | null;
  penalties: number | null;
  playedMatches: number | null;
}

async function fetchScorers(): Promise<FDScorer[]> {
  try {
    const res = await fetch("https://api.football-data.org/v4/competitions/WC/scorers?limit=100", {
      headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY! },
      next: { tags: ["scorers"] },
    });
    if (!res.ok) return [];
    const json = await res.json();
    return json.scorers ?? [];
  } catch {
    return [];
  }
}

export default async function ScorersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const raw = await fetchScorers();

  // Sort: goals desc → assists desc → penalties asc → games played asc
  const scorers = [...raw].sort((a, b) =>
    b.goals - a.goals ||
    (b.assists ?? 0) - (a.assists ?? 0) ||
    (a.penalties ?? 0) - (b.penalties ?? 0) ||
    (a.playedMatches ?? 0) - (b.playedMatches ?? 0)
  );

  // Show top 10, but always include everyone tied with the 10th player
  const TOP_N = 10;
  const cutoffGoals = scorers[TOP_N - 1]?.goals ?? 0;
  const displayed = scorers.filter((s) => s.goals >= cutoffGoals);
  const hidden = scorers.length - displayed.length;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Tournament Top Scorers</h1>
        {scorers.length > 0 && (
          <span className="text-xs text-gray-500">
            Top {TOP_N}{displayed.length > TOP_N ? ` + ${displayed.length - TOP_N} tied` : ""}
          </span>
        )}
      </div>

      {scorers.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          Scorer data available once the tournament begins.
        </p>
      ) : (
        <>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left w-8">#</th>
                  <th className="px-3 py-2.5 text-left">Player</th>
                  <th className="px-3 py-2.5 text-left hidden sm:table-cell">Team</th>
                  <th className="px-3 py-2.5 text-right w-12">Gls</th>
                  <th className="px-3 py-2.5 text-right w-12">Ast</th>
                  <th className="px-3 py-2.5 text-right w-12 hidden sm:table-cell">Pen</th>
                  <th className="px-3 py-2.5 text-right w-12 hidden sm:table-cell">MP</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((s, i) => {
                  const flagSrc = getFlagUrl(s.team.name) ?? getFlagUrl(s.team.shortName);
                  const rank = scorers.filter((x, j) => j < i && x.goals > s.goals).length + 1;
                  return (
                    <tr key={s.player.id} className={`border-b border-white/5 last:border-0 ${i % 2 !== 0 ? "bg-white/[0.02]" : ""}`}>
                      <td className="px-3 py-2.5 text-gray-500 font-mono text-xs">{rank}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-white font-medium">{s.player.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5 sm:hidden">
                          {flagSrc
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={flagSrc} alt={s.team.name} className="w-4 h-3 object-cover rounded-sm border border-gray-700 shrink-0" />
                            : null
                          }
                          <span className="text-xs text-gray-400">{s.team.shortName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">
                        <div className="flex items-center gap-1.5">
                          {flagSrc
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={flagSrc} alt={s.team.name} className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />
                            : null
                          }
                          <span className="text-gray-300 text-xs">{s.team.shortName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-bold text-emerald-400">{s.goals}</td>
                      <td className="px-3 py-2.5 text-right text-gray-300">{s.assists ?? 0}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500 hidden sm:table-cell">{s.penalties ?? 0}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500 hidden sm:table-cell">{s.playedMatches ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hidden > 0 && (
            <p className="text-center text-xs text-gray-600 mt-3">
              {hidden} more player{hidden !== 1 ? "s" : ""} with fewer goals not shown
            </p>
          )}
        </>
      )}
    </div>
  );
}
