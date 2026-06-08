"use client";

import type { BonusQuestion } from "@/types/database";

interface Answer {
  user_id: string;
  question_id: string;
  answer: string;
  points_earned: number | null;
  profiles: { name: string | null; username: string } | null;
}

interface Player {
  id: string;
  name: string | null;
  username: string;
}

interface Props {
  questions: BonusQuestion[];
  allAnswers: Answer[];
  players: Player[];
}

function displayName(p: Player) {
  return p.name || p.username;
}

export default function BonusAllAnswers({ questions, allAnswers, players }: Props) {
  if (players.length === 0) {
    return <p className="text-gray-400 text-sm">No answers submitted yet.</p>;
  }

  // Build lookup: question_id → user_id → answer
  const lookup: Record<string, Record<string, Answer>> = {};
  for (const a of allAnswers) {
    if (!lookup[a.question_id]) lookup[a.question_id] = {};
    lookup[a.question_id][a.user_id] = a;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-800">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-900/90 backdrop-blur-sm">
            <th className="text-left px-4 py-3 text-gray-400 font-medium text-xs uppercase tracking-wider w-48 sticky left-0 bg-gray-900/90 backdrop-blur-sm border-r border-white/10">
              Question
            </th>
            {players.map((p) => (
              <th key={p.id} className="px-3 py-3 text-center text-xs font-medium text-gray-300 whitespace-nowrap min-w-[110px]">
                {displayName(p)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {questions.map((q, qi) => (
            <tr key={q.id} className={qi % 2 === 0 ? "bg-gray-950" : "bg-gray-900/50"}>
              <td className="px-4 py-3 sticky left-0 border-r border-gray-800 bg-inherit">
                <div className="text-[10px] text-amber-400 font-semibold uppercase mb-0.5">{q.category}</div>
                <div className="text-white text-xs font-medium leading-snug">{q.question}</div>
                <div className="text-gray-500 text-[10px] mt-0.5">{q.max_points} pts</div>
                {q.resolved_at && (
                  <div className="text-emerald-400 text-[10px] mt-0.5">
                    ✓ {q.correct_answer}
                  </div>
                )}
              </td>
              {players.map((p) => {
                const ans = lookup[q.id]?.[p.id];
                const pts = ans?.points_earned;
                return (
                  <td key={p.id} className="px-3 py-3 text-center">
                    {ans ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-white text-xs">{ans.answer}</span>
                        {pts !== null && pts !== undefined && (
                          <span className={`text-[10px] font-bold ${pts > 0 ? "text-emerald-400" : "text-gray-500"}`}>
                            {pts > 0 ? `+${pts}` : "0"} pts
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
