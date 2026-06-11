"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BonusQuestion, BonusAnswer } from "@/types/database";
import { BONUS_LOCK_AT } from "@/lib/constants";

// ── Input type ────────────────────────────────────────────────────────────────

type AnswerType = "team" | "player" | "number" | "yesno" | "text" | "select";

// ── Sub-inputs ────────────────────────────────────────────────────────────────

const selectCls = `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
  disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-amber-500
  appearance-none cursor-pointer`;

function TeamSelect({ value, onChange, disabled, teams }: {
  value: string; onChange: (v: string) => void; disabled: boolean; teams: string[];
}) {
  return (
    <div className="relative flex-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={selectCls}
      >
        <option value="">Select a team…</option>
        {teams.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
    </div>
  );
}

function YesNoSelect({ value, onChange, disabled }: {
  value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  return (
    <div className="relative flex-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={selectCls}
      >
        <option value="">Select…</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
    </div>
  );
}

function NumberInput({ value, onChange, disabled }: {
  value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={4}
      value={value}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        onChange(digits === "" ? "" : String(parseInt(digits, 10)));
      }}
      disabled={disabled}
      placeholder="Enter a number…"
      autoComplete="off"
      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
        disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-amber-500"
    />
  );
}

function PlayerSearch({ value, onChange, disabled, players }: {
  value: string; onChange: (v: string) => void; disabled: boolean;
  players: { name: string; team: string; position: string }[];
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep query in sync if value changes externally (e.g. initial load)
  useEffect(() => { setQuery(value); }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const suggestions = query.length >= 2
    ? players.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  function handleSelect(name: string) {
    setQuery(name);
    onChange(name);
    setOpen(false);
  }

  return (
    <div className="relative flex-1" ref={containerRef}>
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        placeholder={players.length ? "Type a player name…" : "Enter player name…"}
        autoComplete="off"
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
          disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-amber-500"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-700
          rounded-lg overflow-hidden shadow-xl max-h-56 overflow-y-auto">
          {suggestions.map((p) => (
            <li key={p.name}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(p.name); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-700 transition-colors"
              >
                <span className="text-white text-sm">{p.name}</span>
                <span className="text-gray-500 text-xs ml-2">{p.team}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main form ─────────────────────────────────────────────────────────────────

interface Props {
  questions: BonusQuestion[];
  answerMap: Record<string, BonusAnswer>;
  userId: string;
  isLocked: boolean;
  teamNames: string[];
}

export default function BonusForm({ questions, answerMap, userId, isLocked: isLockedProp, teamNames }: Props) {
  const [isLocked, setIsLocked] = useState(isLockedProp || new Date() >= BONUS_LOCK_AT);
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(answerMap).map(([qid, a]) => [qid, a.answer]))
  );
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (isLocked) return;
    const ms = BONUS_LOCK_AT.getTime() - Date.now();
    if (ms <= 0) { setIsLocked(true); return; }
    const t = setTimeout(() => setIsLocked(true), ms);
    return () => clearTimeout(t);
  }, [isLocked]);
  const [players, setPlayers] = useState<{ name: string; team: string; position: string }[]>([]);

  // Fetch players if any question needs them
  useEffect(() => {
    const needsPlayers = questions.some((q) => (q.answer_type ?? "text") === "player");
    if (!needsPlayers) return;
    fetch("/api/players").then((r) => r.json()).then((d) => setPlayers(d.players ?? []));
  }, [questions]);

  function setAnswer(qid: string, value: string) {
    setAnswers((a) => ({ ...a, [qid]: value }));
  }

  function handleSave(questionId: string) {
    const answer = (answers[questionId] ?? "").trim();
    if (!answer) {
      setErrors((e) => ({ ...e, [questionId]: "Answer cannot be empty." }));
      return;
    }
    setErrors((e) => ({ ...e, [questionId]: "" }));
    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.from("bonus_answers").upsert(
        { user_id: userId, question_id: questionId, answer },
        { onConflict: "user_id,question_id" }
      );
      if (error) { setErrors((e) => ({ ...e, [questionId]: error.message })); return; }
      setSaved((s) => ({ ...s, [questionId]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [questionId]: false })), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {questions.map((q) => {
        const existing = answerMap[q.id];
        const pts = existing?.points_earned;
        const isResolved = q.resolved_at !== null;
        const type: AnswerType = (q.answer_type as AnswerType) ?? "text";
        const locked = isLocked || isResolved;

        return (
          <div key={q.id} className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <span className="text-xs text-amber-400 font-semibold uppercase tracking-wide">
                  {q.category}
                </span>
                <p className="text-white font-medium mt-0.5">{q.question}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xs text-gray-500">Max</div>
                <div className="text-sm font-bold text-amber-400">{q.max_points} pts</div>
              </div>
            </div>

            {isResolved && (
              <div className="text-xs text-gray-400 mb-2">
                Correct answer: <span className="text-white font-medium">{q.correct_answer}</span>
              </div>
            )}

            <div className="flex gap-2 items-center">
              {type === "team" && (
                <TeamSelect
                  value={answers[q.id] ?? ""}
                  onChange={(v) => setAnswer(q.id, v)}
                  disabled={locked}
                  teams={teamNames}
                />
              )}
              {type === "select" && (
                <div className="relative flex-1">
                  <select
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                    disabled={locked}
                    className={selectCls}
                  >
                    <option value="">Select…</option>
                    {(q.options ?? []).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">▼</span>
                </div>
              )}
              {type === "yesno" && (
                <YesNoSelect
                  value={answers[q.id] ?? ""}
                  onChange={(v) => setAnswer(q.id, v)}
                  disabled={locked}
                />
              )}
              {type === "number" && (
                <NumberInput
                  value={answers[q.id] ?? ""}
                  onChange={(v) => setAnswer(q.id, v)}
                  disabled={locked}
                />
              )}
              {type === "player" && (
                <PlayerSearch
                  value={answers[q.id] ?? ""}
                  onChange={(v) => setAnswer(q.id, v)}
                  disabled={locked}
                  players={players}
                />
              )}
              {type === "text" && (
                <input
                  type="text"
                  value={answers[q.id] ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  disabled={locked}
                  placeholder="Your answer…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm
                    disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-amber-500"
                />
              )}

              {!locked && (
                <button
                  onClick={() => handleSave(q.id)}
                  disabled={isPending}
                  className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white
                    px-3 py-2 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  {saved[q.id] ? "Saved ✓" : "Save"}
                </button>
              )}

              {pts !== null && pts !== undefined && (
                <span className={`text-sm font-bold shrink-0 ${pts > 0 ? "text-emerald-400" : "text-gray-500"}`}>
                  {pts > 0 ? `+${pts}` : "0"} pts
                </span>
              )}
            </div>

            {errors[q.id] && <p className="text-red-400 text-xs mt-1">{errors[q.id]}</p>}
          </div>
        );
      })}
    </div>
  );
}
