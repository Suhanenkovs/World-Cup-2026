"use client";

import { useState } from "react";
import { formatInTimeZone } from "date-fns-tz";
import type { MatchWithTeams } from "@/types/database";

interface MatchState {
  status: string;
  homeScore: string;
  awayScore: string;
  homeScoreEt: string;
  awayScoreEt: string;
  penHome: string;
  penAway: string;
  scoreDuration: string;
}

function toStr(v: number | null | undefined): string {
  return v !== null && v !== undefined ? String(v) : "";
}

function initState(m: MatchWithTeams): MatchState {
  return {
    status: m.status,
    homeScore: toStr(m.home_score),
    awayScore: toStr(m.away_score),
    homeScoreEt: toStr(m.home_score_et),
    awayScoreEt: toStr(m.away_score_et),
    penHome: toStr(m.penalties_home),
    penAway: toStr(m.penalties_away),
    scoreDuration: m.score_duration ?? "",
  };
}

const inputCls =
  "w-10 text-center bg-gray-800 border border-gray-700 rounded px-1 py-1 text-white text-sm font-mono focus:outline-none focus:border-amber-500";

const selectCls =
  "bg-gray-800 border border-gray-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-amber-500 cursor-pointer";

interface Props {
  matches: MatchWithTeams[];
}

export default function MatchResultsPanel({ matches }: Props) {
  const [states, setStates] = useState<Record<string, MatchState>>(
    Object.fromEntries(matches.map((m) => [m.id, initState(m)]))
  );
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [msgs, setMsgs] = useState<Record<string, string>>({});

  function update(id: string, patch: Partial<MatchState>) {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function save(match: MatchWithTeams) {
    const s = states[match.id];
    setSaving((p) => ({ ...p, [match.id]: true }));
    setMsgs((p) => ({ ...p, [match.id]: "" }));
    try {
      const res = await fetch("/api/admin/update-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId: match.id,
          status: s.status,
          homeScore: s.homeScore,
          awayScore: s.awayScore,
          homeScoreEt: s.homeScoreEt,
          awayScoreEt: s.awayScoreEt,
          penHome: s.penHome,
          penAway: s.penAway,
          scoreDuration: s.scoreDuration,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMsgs((p) => ({ ...p, [match.id]: "Saved" }));
      setTimeout(() => setMsgs((p) => ({ ...p, [match.id]: "" })), 2000);
    } catch (e) {
      setMsgs((p) => ({ ...p, [match.id]: (e as Error).message }));
    } finally {
      setSaving((p) => ({ ...p, [match.id]: false }));
    }
  }

  // Group by date
  const byDate: { date: string; list: MatchWithTeams[] }[] = [];
  for (const m of matches) {
    const d = formatInTimeZone(new Date(m.scheduled_at), "Europe/Riga", "yyyy-MM-dd");
    const last = byDate[byDate.length - 1];
    if (last?.date === d) {
      last.list.push(m);
    } else {
      byDate.push({ date: d, list: [m] });
    }
  }

  return (
    <div className="space-y-6">

      {byDate.map(({ date, list }) => (
        <div key={date}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
            {formatInTimeZone(new Date(date + "T12:00:00Z"), "Europe/Riga", "EEEE, d MMMM")}
          </h3>
          <div className="bg-gray-900/50 border border-white/10 rounded-xl overflow-hidden divide-y divide-white/5">
            {list.map((m) => {
              const s = states[m.id];
              const isFinished = s.status === "finished";
              const showEtPen = isFinished && s.scoreDuration && s.scoreDuration !== "REGULAR";
              const msg = msgs[m.id];
              const time = formatInTimeZone(new Date(m.scheduled_at), "Europe/Riga", "HH:mm");
              const label =
                m.stage === "group"
                  ? `Group ${m.group_letter}`
                  : m.stage.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

              return (
                <div key={m.id} className="px-4 py-3">
                  {/* Match header */}
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-gray-500 font-mono w-10 shrink-0">{time}</span>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">{label}</span>
                    <span className="text-[10px] text-gray-500">{m.venue ?? ""}</span>
                  </div>

                  {/* Score + status row */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Home team */}
                    <span className="text-sm font-semibold text-white min-w-[5rem] text-right flex-1">
                      {m.home_team?.name ?? "TBD"}
                    </span>

                    {/* Regulation score */}
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={99}
                        className={inputCls}
                        value={s.homeScore}
                        onChange={(e) => update(m.id, { homeScore: e.target.value })}
                      />
                      <span className="text-gray-500 font-mono text-sm">:</span>
                      <input
                        type="number"
                        min={0}
                        max={99}
                        className={inputCls}
                        value={s.awayScore}
                        onChange={(e) => update(m.id, { awayScore: e.target.value })}
                      />
                    </div>

                    {/* Away team */}
                    <span className="text-sm font-semibold text-white min-w-[5rem] flex-1">
                      {m.away_team?.name ?? "TBD"}
                    </span>

                    {/* Status */}
                    <select
                      className={selectCls}
                      value={s.status}
                      onChange={(e) => update(m.id, { status: e.target.value })}
                    >
                      <option value="scheduled">Scheduled</option>
                      <option value="live">Live</option>
                      <option value="finished">Finished</option>
                    </select>

                    {/* Duration (only when finished) */}
                    {isFinished && (
                      <select
                        className={selectCls}
                        value={s.scoreDuration}
                        onChange={(e) => update(m.id, { scoreDuration: e.target.value })}
                      >
                        <option value="">Regular</option>
                        <option value="REGULAR">Regular</option>
                        <option value="EXTRA_TIME">AET</option>
                        <option value="PENALTY_SHOOTOUT">Penalties</option>
                      </select>
                    )}

                    {/* Save button */}
                    <button
                      onClick={() => save(m)}
                      disabled={saving[m.id]}
                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 rounded text-xs font-semibold text-white transition-colors shrink-0"
                    >
                      {saving[m.id] ? "…" : "Save"}
                    </button>

                    {msg && (
                      <span
                        className={`text-xs shrink-0 ${msg === "Saved" ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {msg}
                      </span>
                    )}
                  </div>

                  {/* ET / Penalty row */}
                  {showEtPen && (
                    <div className="mt-2 flex flex-wrap items-center gap-3 pl-12 text-xs text-gray-400">
                      {s.scoreDuration === "EXTRA_TIME" || s.scoreDuration === "PENALTY_SHOOTOUT" ? (
                        <div className="flex items-center gap-1">
                          <span>AET score:</span>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            className={inputCls}
                            value={s.homeScoreEt}
                            onChange={(e) => update(m.id, { homeScoreEt: e.target.value })}

                          />
                          <span className="text-gray-500 font-mono">:</span>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            className={inputCls}
                            value={s.awayScoreEt}
                            onChange={(e) => update(m.id, { awayScoreEt: e.target.value })}

                          />
                        </div>
                      ) : null}
                      {s.scoreDuration === "PENALTY_SHOOTOUT" && (
                        <div className="flex items-center gap-1">
                          <span>Pens:</span>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            className={inputCls}
                            value={s.penHome}
                            onChange={(e) => update(m.id, { penHome: e.target.value })}

                          />
                          <span className="text-gray-500 font-mono">:</span>
                          <input
                            type="number"
                            min={0}
                            max={99}
                            className={inputCls}
                            value={s.penAway}
                            onChange={(e) => update(m.id, { penAway: e.target.value })}

                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
