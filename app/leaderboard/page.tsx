import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPrizeAmounts } from "@/lib/scoring";

export const revalidate = 60;

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
            <div key={label} className="bg-gray-900/75 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 text-center">
              <div className="text-xs text-gray-500">{label}</div>
              <div className={`text-xl font-bold mt-0.5 ${accent}`}>{value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-gray-900/75 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-left w-10">#</th>
              <th className="px-4 py-3 text-left">Player</th>
              <th className="px-4 py-3 text-right">Match</th>
              <th className="px-4 py-3 text-right">Bonus</th>
              <th className="px-4 py-3 text-right font-semibold text-gray-300">Total</th>
              <th className="px-4 py-3 text-right hidden sm:table-cell">Correct</th>
            </tr>
          </thead>
          <tbody>
            {(rows ?? []).map((row, i) => {
              const isMe = row.id === user.id;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

              return (
                <tr
                  key={row.id}
                  className={`border-b border-gray-800/60 last:border-0 transition-colors
                    ${isMe ? "bg-emerald-900/20" : "hover:bg-gray-800/30"}`}
                >
                  <td className="px-4 py-3 text-gray-500 font-mono">
                    {medal ?? i + 1}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${isMe ? "text-emerald-400" : "text-white"}`}>
                      {row.name || row.username}
                      {isMe && <span className="text-xs text-gray-500 ml-1">(you)</span>}
                    </span>
                    {!row.paid && (
                      <span className="ml-2 text-xs text-amber-500">⚠ unpaid</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300 font-mono">{row.match_points}</td>
                  <td className="px-4 py-3 text-right text-amber-400 font-mono">{row.bonus_points}</td>
                  <td className="px-4 py-3 text-right font-bold text-white font-mono">{row.total_points}</td>
                  <td className="px-4 py-3 text-right text-gray-400 hidden sm:table-cell">
                    {row.correct_predictions}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
