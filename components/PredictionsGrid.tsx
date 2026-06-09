"use client";

import { useState, useTransition } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { createClient } from "@/lib/supabase/client";
import type { MatchWithTeams, Prediction, Team } from "@/types/database";
import type { Stage } from "@/lib/constants";
import { POINTS_CORRECT_RESULT, POINTS_EXACT_SCORE, POINTS_GOAL_DIFF, STAGE_LABELS } from "@/lib/constants";
import { getFlagUrl } from "@/lib/teamFlags";

function Flag({ team }: { team: Team | null }) {
  if (!team) return null;
  const src = team.flag_url ?? getFlagUrl(team.name);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={team.name} className="w-6 h-4 object-cover rounded shrink-0 border border-gray-700" />;
}

function GroupOrStageBadge({ stage, groupLetter }: { stage: string; groupLetter: string | null }) {
  if (stage === "group" && groupLetter) {
    return (
      <span className="text-emerald-400 font-semibold">Group {groupLetter}</span>
    );
  }
  return (
    <span className="text-amber-400">{STAGE_LABELS[stage as Stage] ?? stage}</span>
  );
}

function sanitizeScore(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 2);
  // Remove leading zero when a second digit follows (09 → 9)
  return digits.length > 1 && digits[0] === "0" ? digits.slice(1) : digits;
}

interface Props {
  matches: MatchWithTeams[];
  predictions: Record<string, Prediction>;
  stage: Stage;
  userId: string;
  isPaid: boolean;
}

interface MatchRowProps {
  match: MatchWithTeams;
  pred: Prediction | undefined;
  stage: Stage;
  userId: string;
  isPaid: boolean;
}

function MatchRow({ match, pred, stage, userId, isPaid }: MatchRowProps) {
  const now = new Date();
  const kickoff = new Date(match.scheduled_at);
  const isLocked = now >= kickoff || match.status !== "scheduled";
  const isFinished = match.status === "finished";

  const [home, setHome] = useState(pred ? String(pred.pred_home) : "");
  const [away, setAway] = useState(pred ? String(pred.pred_away) : "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setter(sanitizeScore(e.target.value));
      setSaved(false);
    };
  }

  function handleSave() {
    if (!isPaid) { setError("Entry fee not confirmed."); return; }
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (isNaN(h) || isNaN(a)) {
      setError("Enter both scores.");
      return;
    }
    setError("");
    startTransition(async () => {
      const supabase = createClient();
      const { error: err } = await supabase.from("predictions").upsert(
        { user_id: userId, match_id: match.id, pred_home: h, pred_away: a },
        { onConflict: "user_id,match_id" }
      );
      if (err) { setError(err.message); return; }
      // Append-only audit log — never updated or deleted
      await supabase.from("prediction_logs").insert(
        { user_id: userId, match_id: match.id, pred_home: h, pred_away: a }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const pts = pred?.points_earned;

  return (
    <div className={`bg-gray-900/50 backdrop-blur-sm border rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3
      ${isFinished ? "border-gray-700" : "border-gray-800"}`}>

      {/* Date / group / venue */}
      <div className="text-xs w-28 shrink-0 space-y-0.5">
        <div className="text-gray-400">{formatInTimeZone(kickoff, "Europe/Riga", "d MMM · HH:mm")}</div>
        <div><GroupOrStageBadge stage={match.stage} groupLetter={match.group_letter} /></div>
        {isLocked && !isFinished && <div className="text-amber-400">Locked</div>}
      </div>

      {/* Teams + inputs */}
      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
        <div className="flex items-center justify-end gap-1.5 min-w-0">
          <span className="hidden sm:block font-medium text-white truncate">{match.home_team?.name ?? "TBD"}</span>
          <span className="sm:hidden font-medium text-white shrink-0">{match.home_team ? (match.home_team.short_name ?? match.home_team.name).slice(0, 3).toUpperCase() : "TBD"}</span>
          <Flag team={match.home_team} />
        </div>

        {isFinished && match.home_score !== null ? (
          <div className="flex flex-col items-center gap-0.5 px-2">
            <span className="font-mono font-bold text-white text-xl leading-none">
              {match.home_score}–{match.away_score}
            </span>
            {pred ? (
              <span className="text-[10px] text-gray-500 font-mono">
                pick: {pred.pred_home}–{pred.pred_away}
              </span>
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
              name={`home-score-${match.id}`}
              value={home}
              onChange={handleChange(setHome)}
              disabled={isLocked}
              placeholder=""
              className="w-10 text-center bg-gray-800 border border-gray-700 rounded-md py-1 text-white text-sm
                placeholder-gray-600 disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus:border-emerald-500 [appearance:textfield]
                [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-gray-600">–</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={2}
              autoComplete="off"
              name={`away-score-${match.id}`}
              value={away}
              onChange={handleChange(setAway)}
              disabled={isLocked}
              placeholder=""
              className="w-10 text-center bg-gray-800 border border-gray-700 rounded-md py-1 text-white text-sm
                placeholder-gray-600 disabled:opacity-40 disabled:cursor-not-allowed
                focus:outline-none focus:border-emerald-500 [appearance:textfield]
                [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
          </div>
        )}

        <div className="flex items-center gap-1.5 min-w-0">
          <Flag team={match.away_team} />
          <span className="hidden sm:block font-medium text-white truncate">{match.away_team?.name ?? "TBD"}</span>
          <span className="sm:hidden font-medium text-white shrink-0">{match.away_team ? (match.away_team.short_name ?? match.away_team.name).slice(0, 3).toUpperCase() : "TBD"}</span>
        </div>
      </div>

      {/* Points / save / quality */}
      <div className="flex items-center gap-2 shrink-0 justify-end min-w-[70px]">
        {isFinished && pts !== null && pts !== undefined ? (
          <div className="flex flex-col items-end gap-0.5">
            <span className={`text-[10px] font-semibold
              ${pts >= POINTS_EXACT_SCORE[stage] ? "text-yellow-400" :
                pts >= POINTS_GOAL_DIFF[stage]   ? "text-emerald-400" :
                pts > 0                           ? "text-blue-400" : "text-gray-600"}`}>
              {pts >= POINTS_EXACT_SCORE[stage] ? "Exact" :
               pts >= POINTS_GOAL_DIFF[stage]   ? "GD ✓" :
               pts > 0                           ? "Result ✓" : "Wrong"}
            </span>
            <span className={`font-mono font-bold text-sm ${pts > 0 ? "text-emerald-400" : "text-gray-600"}`}>
              {pts > 0 ? `+${pts}` : "0"} pts
            </span>
          </div>
        ) : isFinished && pred ? (
          <span className="text-xs text-gray-600">pending</span>
        ) : !isLocked ? (
          <button
            onClick={handleSave}
            disabled={isPending}
            className="text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white
              px-3 py-1.5 rounded-lg transition-colors"
          >
            {isPending ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        ) : null}
      </div>

      {error && <p className="text-red-400 text-xs w-full">{error}</p>}
    </div>
  );
}

export default function PredictionsGrid({ matches, predictions, stage, userId, isPaid }: Props) {
  const [localPreds] = useState(predictions);

  return (
    <div className="flex flex-col gap-2">
      {matches.map((match) => (
        <MatchRow
          key={match.id}
          match={match}
          pred={localPreds[match.id]}
          stage={stage}
          userId={userId}
          isPaid={isPaid}
        />
      ))}
    </div>
  );
}
