import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPrizeAmounts } from "@/lib/scoring";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: rows }, { data: config }] = await Promise.all([
    supabase.from("leaderboard").select("*"),
    supabase.from("prize_config").select("*").eq("id", 1).single(),
  ]);

  const paidCount = (rows ?? []).filter((r) => r.paid).length;
  const entryFee = config?.entry_fee ?? 20;
  const prizes = config
    ? getPrizeAmounts(paidCount, entryFee, config.winner_pct, config.second_pct, config.third_pct)
    : null;

  // Sort: total desc, then match_points as tiebreaker
  const sorted = [...(rows ?? [])].sort((a, b) =>
    b.total_points - a.total_points || b.match_points - a.match_points
  );

  const tournamentStarted = sorted.some((r) => r.total_points > 0);

  // Standard competition ranking: same (total, match) → same position
  function getPos(row: (typeof sorted)[0]) {
    return sorted.filter(
      (r) =>
        r.total_points > row.total_points ||
        (r.total_points === row.total_points && r.match_points > row.match_points)
    ).length + 1;
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-2">Leaderboard</h1>

      {prizes && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Prize pool", value: `€${prizes.pot}`, accent: "text-white" },
            { label: "1st place", value: `€${prizes.first}`, accent: "text-yellow-400" },
            { label: "2nd place", value: `€${prizes.second}`, accent: "text-gray-300" },
            { label: "3rd place", value: `€${prizes.third}`, accent: "text-amber-600" },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 text-center">
              <div className="text-xs text-gray-500">{label}</div>
              <div className={`text-xl font-bold mt-0.5 ${accent}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-2 sm:px-4 py-3 text-left w-8">#</th>
              <th className="px-2 sm:px-4 py-3 text-left">Player</th>
              <th className="px-2 sm:px-4 py-3 text-right"><span className="sm:hidden">Mch</span><span className="hidden sm:inline">Match</span></th>
              <th className="px-2 sm:px-4 py-3 text-right"><span className="sm:hidden">Bon</span><span className="hidden sm:inline">Bonus</span></th>
              <th className="px-2 sm:px-4 py-3 text-right font-semibold text-gray-300"><span className="sm:hidden">Tot</span><span className="hidden sm:inline">Total</span></th>
              <th className="px-2 sm:px-4 py-3 text-right hidden sm:table-cell">Correct</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isMe = row.id === user.id;
              const pos = tournamentStarted ? getPos(row) : null;
              const medal = pos === 1 ? "🥇" : pos === 2 ? "🥈" : pos === 3 ? "🥉" : null;

              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-800/60 last:border-0 transition-colors
                    ${isMe ? "bg-emerald-900/20" : "hover:bg-gray-800/30"}`}
                >
                  <td className="px-2 sm:px-4 py-3 text-gray-500 font-mono">
                    {pos === null ? "–" : medal ?? pos}
                  </td>
                  <td className="px-2 sm:px-4 py-3">
                    <Link href={`/players/${row.id}`} className={`font-medium hover:text-amber-400 transition-colors ${isMe ? "text-emerald-400" : "text-white"}`}>
                      {(row as any).name || row.username}
                      {isMe && <span className="text-xs text-gray-500 ml-1">(you)</span>}
                    </Link>
                    {!row.paid && (
                      <span className="ml-2 text-xs text-amber-500">⚠ unpaid</span>
                    )}
                  </td>
                  <td className="px-2 sm:px-4 py-3 text-right text-gray-300 font-mono">{row.match_points}</td>
                  <td className="px-2 sm:px-4 py-3 text-right text-amber-400 font-mono">{row.bonus_points}</td>
                  <td className="px-2 sm:px-4 py-3 text-right font-bold text-white font-mono">{row.total_points}</td>
                  <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                    {row.correct_predictions}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-600 mt-3 text-right">
        Tiebreaker: equal total points → ranked by match points. True tie if both are equal.
      </p>
    </div>
  );
}
