import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { BackButton } from "@/components/BackButton";
import { formatInTimeZone } from "date-fns-tz";
import { STAGE_LABELS, POINTS_EXACT_SCORE, POINTS_GOAL_DIFF, type Stage } from "@/lib/constants";
import type { MatchWithTeams } from "@/types/database";
import { getFlagUrl } from "@/lib/teamFlags";
import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";

export const revalidate = 30;

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("*, home_team:home_team_id(*), away_team:away_team_id(*)")
    .eq("id", id)
    .single();

  if (!match) notFound();
  const m = match as MatchWithTeams;

  const { data: predictions } = await supabase
    .from("predictions")
    .select("*, user:user_id(username, name)")
    .eq("match_id", id)
    .order("points_earned", { ascending: false, nullsFirst: false });

  const kickoff = new Date(m.scheduled_at);
  const hasScore = m.home_score !== null;

  const homeFlagSrc = m.home_team?.flag_url ?? (m.home_team ? getFlagUrl(m.home_team.name) : null);
  const awayFlagSrc = m.away_team?.flag_url ?? (m.away_team ? getFlagUrl(m.away_team.name) : null);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {m.status === "live" && <AutoRefresh />}
      <BackButton />
      <div className="text-xs text-emerald-400 uppercase tracking-wider mb-2">
        {STAGE_LABELS[m.stage as Stage]}
        {m.group_letter && ` — Group ${m.group_letter}`}
      </div>

      <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-6">
        <div className="text-center text-xs text-gray-500 mb-6">
          {formatInTimeZone(kickoff, "Europe/Riga", "EEEE, d MMMM yyyy")} at {formatInTimeZone(kickoff, "Europe/Riga", "HH:mm")}
          {m.venue && <> &mdash; {m.venue}</>}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          {/* Home team */}
          <div className="flex flex-col items-center gap-2">
            {m.home_team?.api_id ? (
              <Link href={`/teams/${m.home_team.api_id}`} className="flex flex-col items-center gap-2 group">
                {homeFlagSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={homeFlagSrc} alt={m.home_team.name} className="w-16 h-11 object-cover rounded-md border border-gray-700 shadow group-hover:border-amber-500/50 transition-colors" />
                  : <span className="w-16 h-11 rounded-md bg-gray-700 inline-block" />
                }
                <div className="font-bold text-white text-lg text-center group-hover:text-amber-400 transition-colors">{m.home_team.name}</div>
              </Link>
            ) : (
              <>
                {homeFlagSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={homeFlagSrc} alt={m.home_team?.name ?? ""} className="w-16 h-11 object-cover rounded-md border border-gray-700 shadow" />
                  : <span className="w-16 h-11 rounded-md bg-gray-700 inline-block" />
                }
                <div className="font-bold text-white text-lg text-center">{m.home_team?.name ?? "TBD"}</div>
              </>
            )}
          </div>

          {/* Score */}
          <div className="text-center px-4">
            {hasScore ? (
              <div className="font-mono font-extrabold text-3xl text-white">
                {m.home_score} – {m.away_score}
              </div>
            ) : (
              <div className="font-mono text-gray-500 text-2xl">vs</div>
            )}
            {m.status === "live" && (
              <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full animate-pulse mt-2 inline-block">LIVE</span>
            )}
            {m.status === "finished" && (
              <span className="text-xs text-gray-500 mt-2 inline-block">Full Time</span>
            )}
          </div>

          {/* Away team */}
          <div className="flex flex-col items-center gap-2">
            {m.away_team?.api_id ? (
              <Link href={`/teams/${m.away_team.api_id}`} className="flex flex-col items-center gap-2 group">
                {awayFlagSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={awayFlagSrc} alt={m.away_team.name} className="w-16 h-11 object-cover rounded-md border border-gray-700 shadow group-hover:border-amber-500/50 transition-colors" />
                  : <span className="w-16 h-11 rounded-md bg-gray-700 inline-block" />
                }
                <div className="font-bold text-white text-lg text-center group-hover:text-amber-400 transition-colors">{m.away_team.name}</div>
              </Link>
            ) : (
              <>
                {awayFlagSrc
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={awayFlagSrc} alt={m.away_team?.name ?? ""} className="w-16 h-11 object-cover rounded-md border border-gray-700 shadow" />
                  : <span className="w-16 h-11 rounded-md bg-gray-700 inline-block" />
                }
                <div className="font-bold text-white text-lg text-center">{m.away_team?.name ?? "TBD"}</div>
              </>
            )}
          </div>
        </div>
      </div>

      <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3">
        Predictions ({predictions?.length ?? 0})
      </h2>

      {(!predictions || predictions.length === 0) ? (
        <p className="text-gray-500 text-sm">No predictions submitted yet.</p>
      ) : (
        <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[10px] text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-2.5 text-left">Player</th>
                <th className="px-4 py-2.5 text-center">Pick</th>
                {hasScore && <th className="px-4 py-2.5 text-center">Result</th>}
                <th className="px-4 py-2.5 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {predictions.map((p, i) => {
                const u = p.user as { id?: string; username: string; name?: string | null } | null;
                const pts = p.points_earned;
                const stage = m.stage as Stage;
                const ql = hasScore && pts !== null && pts !== undefined
                  ? pts >= POINTS_EXACT_SCORE[stage] ? { text: "Exact", cls: "text-yellow-400" }
                  : pts >= POINTS_GOAL_DIFF[stage]   ? { text: "GD ✓",  cls: "text-emerald-400" }
                  : pts > 0                           ? { text: "Result ✓", cls: "text-blue-400" }
                  : { text: "Wrong", cls: "text-gray-600" }
                  : null;
                return (
                  <tr key={p.id} className={`border-b border-white/5 last:border-0 ${i % 2 !== 0 ? "bg-white/[0.02]" : ""}`}>
                    <td className="px-4 py-2.5">
                      <Link href={`/players/${p.user_id}`} className="font-medium text-white hover:text-amber-400 transition-colors">
                        {u?.name || u?.username || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-center font-mono text-gray-300">
                      {p.pred_home}–{p.pred_away}
                    </td>
                    {hasScore && (
                      <td className="px-4 py-2.5 text-center font-mono font-bold text-white">
                        {m.home_score}–{m.away_score}
                      </td>
                    )}
                    <td className="px-4 py-2.5 text-right">
                      {ql ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className={`text-[10px] font-semibold ${ql.cls}`}>{ql.text}</span>
                          <span className={`font-mono font-bold ${pts! > 0 ? "text-emerald-400" : "text-gray-600"}`}>
                            {pts! > 0 ? `+${pts}` : "0"}
                          </span>
                        </div>
                      ) : pts !== null && pts !== undefined ? (
                        <span className={`font-mono font-bold ${pts > 0 ? "text-emerald-400" : "text-gray-500"}`}>
                          {pts > 0 ? `+${pts}` : "0"}
                        </span>
                      ) : (
                        <span className="text-gray-600 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
