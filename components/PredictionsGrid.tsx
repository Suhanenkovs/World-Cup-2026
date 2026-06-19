"use client";

import { useState, useTransition } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/client";
import type { MatchWithTeams, Prediction, Team } from "@/types/database";
import type { Stage } from "@/lib/constants";
import { POINTS_CORRECT_RESULT, POINTS_EXACT_SCORE, POINTS_GOAL_DIFF, STAGE_LABELS } from "@/lib/constants";
import { getFlagUrl } from "@/lib/teamFlags";
import { getTeamTLA } from "@/lib/teamTLA";

function Flag({ team }: { team: Team | null }) {
  if (!team) return null;
  const src = getFlagUrl(team.name) ?? team.flag_url;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={team.name} className="w-6 h-4 object-cover rounded shrink-0 border border-gray-700" />;
}

function GroupOrStageBadge({ stage, groupLetter }: { stage: string; groupLetter: string | null }) {
  if (stage === "group" && groupLetter) {
    return <span className="text-emerald-400 font-semibold">Group {groupLetter}</span>;
  }
  return <span className="text-amber-400">{STAGE_LABELS[stage as Stage] ?? stage}</span>;
}

function sanitizeScore(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  return digits.length > 1 && digits[0] === "0" ? digits.slice(1) : digits;
}

interface Props {
  matches: MatchWithTeams[];
  predictions: Record<string, Prediction>;
  stage: Stage;
  userId: string;
  isPaid: boolean;
}

export default function PredictionsGrid({ matches, predictions, stage, userId, isPaid }: Props) {
  const now = new Date();

  const [values, setValues] = useState<Record<string, { home: string; away: string }>>(() => {
    const init: Record<string, { home: string; away: string }> = {};
    for (const m of matches) {
      const p = predictions[m.id];
      init[m.id] = { home: p ? String(p.pred_home) : "", away: p ? String(p.pred_away) : "" };
    }
    return init;
  });

  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();

  const editableIds = new Set(
    matches
      .filter((m) => now < new Date(m.scheduled_at) && m.status === "scheduled")
      .map((m) => m.id)
  );

  const dirtyEditable = [...dirty].filter((id) => editableIds.has(id));

  function handleChange(matchId: string, field: "home" | "away", raw: string) {
    const val = sanitizeScore(raw);
    setValues((prev) => ({ ...prev, [matchId]: { ...prev[matchId], [field]: val } }));
    setDirty((prev) => new Set(prev).add(matchId));
    setSaveStatus("idle");
    setRowErrors((prev) => { const next = { ...prev }; delete next[matchId]; return next; });
  }

  function saveAll() {
    if (!isPaid) return;

    // Validate all dirty editable rows
    const newErrors: Record<string, string> = {};
    for (const id of dirtyEditable) {
      const { home, away } = values[id];
      if (home === "" || away === "") newErrors[id] = "Enter both scores.";
    }
    if (Object.keys(newErrors).length > 0) { setRowErrors(newErrors); return; }

    const toSave = dirtyEditable;
    if (toSave.length === 0) return;

    startTransition(async () => {
      const supabase = createClient();
      const results = await Promise.all(
        toSave.map(async (matchId) => {
          const h = parseInt(values[matchId].home, 10);
          const a = parseInt(values[matchId].away, 10);
          const { error } = await supabase.from("predictions").upsert(
            { user_id: userId, match_id: matchId, pred_home: h, pred_away: a },
            { onConflict: "user_id,match_id" }
          );
          if (!error) {
            await supabase.from("prediction_logs").insert(
              { user_id: userId, match_id: matchId, pred_home: h, pred_away: a }
            );
          }
          return { matchId, error };
        })
      );

      const failed = results.filter((r) => r.error);
      const savedIds = results.filter((r) => !r.error).map((r) => r.matchId);

      setDirty((prev) => { const next = new Set(prev); savedIds.forEach((id) => next.delete(id)); return next; });

      if (failed.length > 0) {
        setSaveStatus("error");
        const errs: Record<string, string> = {};
        failed.forEach(({ matchId }) => { errs[matchId] = "Failed to save."; });
        setRowErrors(errs);
      } else {
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    });
  }

  return (
    <div>
      {/* Save bar */}
      {dirtyEditable.length > 0 && (
        <div className="flex items-center justify-between bg-emerald-950/60 border border-emerald-800/50 rounded-xl px-4 py-2.5 mb-3">
          <span className="text-sm text-emerald-300">
            {dirtyEditable.length} unsaved change{dirtyEditable.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={saveAll}
            disabled={isPending || !isPaid}
            className="text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition-colors"
          >
            {isPending ? "Saving…" : "Save all"}
          </button>
        </div>
      )}
      {saveStatus === "saved" && dirtyEditable.length === 0 && (
        <div className="bg-emerald-950/40 border border-emerald-900/40 rounded-xl px-4 py-2.5 mb-3 text-sm text-emerald-400">
          All predictions saved ✓
        </div>
      )}
      {saveStatus === "error" && (
        <div className="bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-2.5 mb-3 text-sm text-red-400">
          Some predictions failed to save — try again.
        </div>
      )}

      <div className="flex flex-col gap-2">
        {matches.map((match) => {
          const isLocked = now >= new Date(match.scheduled_at) || match.status !== "scheduled";
          const isFinished = match.status === "finished";
          const pred = predictions[match.id];
          const val = values[match.id];
          const isDirty = dirty.has(match.id) && !isLocked;
          const pts = pred?.points_earned;
          const rowError = rowErrors[match.id];

          return (
            <div
              key={match.id}
              className={`bg-gray-900/50 backdrop-blur-sm border rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 transition-colors
                ${isFinished ? "border-gray-700" : isDirty ? "border-emerald-800/70" : "border-gray-800"}`}
            >
              {/* Date / group */}
              <div className="text-xs w-28 shrink-0 space-y-0.5">
                <div className="text-gray-400">{formatInTimeZone(new Date(match.scheduled_at), "Europe/Riga", "d MMM · HH:mm")}</div>
                <div><GroupOrStageBadge stage={match.stage} groupLetter={match.group_letter} /></div>
                {isLocked && !isFinished && <div className="text-amber-400">Locked</div>}
              </div>

              {/* Teams + score/inputs */}
              <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                <div className="flex items-center justify-end gap-1.5 min-w-0">
                  <span className="hidden sm:block font-medium text-white truncate">{match.home_team?.name ?? "TBD"}</span>
                  <span className="sm:hidden font-medium text-white shrink-0">{getTeamTLA(match.home_team?.name)}</span>
                  <Flag team={match.home_team} />
                </div>

                {isFinished && match.home_score !== null ? (
                  <div className="flex flex-col items-center gap-0.5 px-2">
                    <span className="font-mono font-bold text-white text-xl leading-none">
                      {match.home_score}–{match.away_score}
                    </span>
                    {pred ? (
                      <span className="text-[10px] text-gray-500 font-mono">pick: {pred.pred_home}–{pred.pred_away}</span>
                    ) : (
                      <span className="text-[10px] text-gray-700">no pick</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      autoComplete="off"
                      name={`home-${match.id}`}
                      value={val.home}
                      onChange={(e) => handleChange(match.id, "home", e.target.value)}
                      disabled={isLocked}
                      className="w-10 text-center bg-gray-800 border border-gray-700 rounded-md py-1 text-white text-sm
                        disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-emerald-500
                        [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-gray-600">–</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={2}
                      autoComplete="off"
                      name={`away-${match.id}`}
                      value={val.away}
                      onChange={(e) => handleChange(match.id, "away", e.target.value)}
                      disabled={isLocked}
                      className="w-10 text-center bg-gray-800 border border-gray-700 rounded-md py-1 text-white text-sm
                        disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-emerald-500
                        [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                )}

                <div className="flex items-center gap-1.5 min-w-0">
                  <Flag team={match.away_team} />
                  <span className="hidden sm:block font-medium text-white truncate">{match.away_team?.name ?? "TBD"}</span>
                  <span className="sm:hidden font-medium text-white shrink-0">{getTeamTLA(match.away_team?.name)}</span>
                </div>
              </div>

              {/* Points / unsaved indicator */}
              <div className="flex items-center gap-2 shrink-0 justify-end min-w-[70px]">
                {isFinished && pts !== null && pts !== undefined ? (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className={`text-[10px] font-semibold
                      ${pts >= POINTS_EXACT_SCORE[stage] ? "text-yellow-400" :
                        pts >= POINTS_GOAL_DIFF[stage]   ? "text-emerald-400" :
                        pts > 0                           ? "text-blue-400" : "text-gray-600"}`}>
                      {pts >= POINTS_EXACT_SCORE[stage] ? "Exact" :
                       pts >= POINTS_GOAL_DIFF[stage]   ? "Diff ✓" :
                       pts > 0                           ? "Result ✓" : "Wrong"}
                    </span>
                    <span className={`font-mono font-bold text-sm ${pts > 0 ? "text-emerald-400" : "text-gray-600"}`}>
                      {pts > 0 ? `+${pts}` : "0"} pts
                    </span>
                  </div>
                ) : isFinished && pred ? (
                  <span className="text-xs text-gray-600">pending</span>
                ) : isDirty ? (
                  <span className="text-[11px] text-emerald-700">unsaved</span>
                ) : null}
              </div>

              {rowError && <p className="text-red-400 text-xs w-full">{rowError}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
