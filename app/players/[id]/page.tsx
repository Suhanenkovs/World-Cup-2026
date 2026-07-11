import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getFlagUrl } from "@/lib/teamFlags";
import { formatInTimeZone } from "date-fns-tz";
import { STAGE_LABELS, POINTS_EXACT_SCORE, POINTS_GOAL_DIFF, type Stage } from "@/lib/constants";
import Link from "next/link";

export const revalidate = 60;

function qualityLabel(pts: number, stage: Stage) {
  if (pts >= POINTS_EXACT_SCORE[stage]) return { text: "Exact", cls: "text-yellow-400" };
  if (pts >= POINTS_GOAL_DIFF[stage])   return { text: "Diff ✓", cls: "text-emerald-400" };
  if (pts > 0)                           return { text: "Result ✓", cls: "text-blue-400" };
  return { text: "Wrong", cls: "text-gray-600" };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: profile }, { data: lbRow }, { data: predRows }] = await Promise.all([
    supabase.from("profiles").select("id, username, paid").eq("id", id).maybeSingle(),
    supabase.from("leaderboard").select("*").eq("id", id).maybeSingle(),
    supabase
      .from("predictions")
      .select("*, match:match_id(*, home_team:home_team_id(*), away_team:away_team_id(*))")
      .eq("user_id", id),
  ]);

  if (!profile) notFound();

  const displayName = (lbRow as any)?.name || (profile as any)?.name || profile.username;
  const isMe = user.id === id;

  // Sort predictions by match scheduled_at
  const preds = (predRows ?? []).sort((a, b) => {
    const ma = (a.match as any)?.scheduled_at ?? "";
    const mb = (b.match as any)?.scheduled_at ?? "";
    return ma < mb ? -1 : 1;
  });

  const finished = preds.filter((p) => (p.match as any)?.status === "finished");
  const upcoming = preds.filter((p) => (p.match as any)?.status !== "finished");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">

      <Link href="/leaderboard" className="text-xs text-gray-500 hover:text-gray-300 transition-colors mb-6 inline-block">
        ← Leaderboard
      </Link>

      {/* Header */}
      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-white">
            {displayName}
            {isMe && <span className="text-sm text-gray-500 font-normal ml-2">(you)</span>}
          </h1>
          {!profile.paid && <span className="text-xs text-amber-500 mt-1 block">⚠ entry fee not confirmed</span>}
        </div>
        {lbRow && (
          <div className="flex gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-white font-mono">{lbRow.total_points}</div>
              <div className="text-xs text-gray-500">Total pts</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-300 font-mono">{lbRow.match_points}</div>
              <div className="text-xs text-gray-500">Match pts</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-400 font-mono">{lbRow.bonus_points}</div>
              <div className="text-xs text-gray-500">Bonus pts</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-400 font-mono">{lbRow.correct_predictions}</div>
              <div className="text-xs text-gray-500">Correct</div>
            </div>
          </div>
        )}
      </div>

      {/* Finished matches */}
      {finished.length > 0 && (
        <div className="mb-6">
          <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Finished</h2>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-[10px] text-gray-500 uppercase tracking-wider">
                  <th className="px-3 py-2 text-left hidden sm:table-cell">Date</th>
                  <th className="px-3 py-2 text-left">Match</th>
                  <th className="px-3 py-2 text-center">Pick</th>
                  <th className="px-3 py-2 text-center">Result</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {finished.map((p) => {
                  const m = p.match as any;
                  if (!m) return null;
                  const kickoff = new Date(m.scheduled_at);
                  const stage = m.stage as Stage;
                  const homeName = m.home_team?.short_name ?? m.home_team?.name ?? "?";
                  const awayName = m.away_team?.short_name ?? m.away_team?.name ?? "?";
                  const homeSrc = (m.home_team ? getFlagUrl(m.home_team.name) : null) ?? m.home_team?.flag_url ?? null;
                  const awaySrc = (m.away_team ? getFlagUrl(m.away_team.name) : null) ?? m.away_team?.flag_url ?? null;
                  const pts = p.points_earned;
                  const ql = pts !== null && pts !== undefined ? qualityLabel(pts, stage) : null;

                  return (
                    <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap hidden sm:table-cell">
                        {formatInTimeZone(kickoff, "Europe/Riga", "d MMM")}
                      </td>
                      <td className="px-3 py-2.5">
                        <Link href={`/matches/${m.id}`} className="flex items-center gap-1.5 hover:text-amber-400 transition-colors group">
                          {homeSrc
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={homeSrc} alt={homeName} loading="lazy" className="w-4 h-3 object-cover rounded-sm border border-gray-700 shrink-0" />
                            : null}
                          <span className="text-white text-xs group-hover:text-amber-400">{homeName}</span>
                          <span className="text-gray-600 text-xs">vs</span>
                          {awaySrc
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={awaySrc} alt={awayName} loading="lazy" className="w-4 h-3 object-cover rounded-sm border border-gray-700 shrink-0" />
                            : null}
                          <span className="text-white text-xs group-hover:text-amber-400">{awayName}</span>
                        </Link>
                        <div className="text-[10px] text-gray-600 mt-0.5">{STAGE_LABELS[stage] ?? stage}{m.group_letter ? ` ${m.group_letter}` : ""}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-gray-300 text-sm">
                        {p.pred_home}–{p.pred_away}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-white text-sm">
                        {m.home_score}–{m.away_score}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {ql && (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className={`text-[10px] font-semibold ${ql.cls}`}>{ql.text}</span>
                            <span className={`font-mono font-bold text-sm ${pts! > 0 ? "text-emerald-400" : "text-gray-600"}`}>
                              {pts! > 0 ? `+${pts}` : "0"}
                            </span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upcoming predictions */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Upcoming picks</h2>
          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            {upcoming.map((p) => {
              const m = p.match as any;
              if (!m) return null;
              const kickoff = new Date(m.scheduled_at);
              const homeSrc = (m.home_team ? getFlagUrl(m.home_team.name) : null) ?? m.home_team?.flag_url ?? null;
              const awaySrc = (m.away_team ? getFlagUrl(m.away_team.name) : null) ?? m.away_team?.flag_url ?? null;
              return (
                <Link
                  key={p.id}
                  href={`/matches/${m.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors"
                >
                  <span className="text-gray-500 text-xs w-20 shrink-0">
                    {formatInTimeZone(kickoff, "Europe/Riga", "d MMM HH:mm")}
                  </span>
                  <div className="flex items-center gap-1.5 flex-1 min-w-0 text-xs">
                    {homeSrc
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={homeSrc} alt="" loading="lazy" className="w-4 h-3 object-cover rounded-sm border border-gray-700 shrink-0" />
                      : null}
                    <span className="text-white truncate">{m.home_team?.name ?? "TBD"}</span>
                    <span className="text-gray-600 shrink-0">vs</span>
                    {awaySrc
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={awaySrc} alt="" loading="lazy" className="w-4 h-3 object-cover rounded-sm border border-gray-700 shrink-0" />
                      : null}
                    <span className="text-white truncate">{m.away_team?.name ?? "TBD"}</span>
                  </div>
                  <span className="font-mono text-gray-400 text-sm shrink-0">{p.pred_home}–{p.pred_away}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {preds.length === 0 && (
        <p className="text-gray-500 text-sm">No predictions submitted yet.</p>
      )}
    </div>
  );
}
