"use client";

import { useState } from "react";
import AdminPanel from "./AdminPanel";
import MatchResultsPanel from "./MatchResultsPanel";
import type { Profile, BonusQuestion, MatchWithTeams } from "@/types/database";

type Tab = "participants" | "bonus" | "matches";

interface PrizeConfig {
  id: number;
  entry_fee: number;
  winner_pct: number;
  second_pct: number;
  third_pct: number;
  fourth_pct: number;
  fifth_pct: number;
}

interface Props {
  players: (Profile & { email: string })[];
  questions: BonusQuestion[];
  prizeConfig: PrizeConfig;
  matches: MatchWithTeams[];
}

const TABS: { id: Tab; label: string }[] = [
  { id: "participants", label: "Prize & Participants" },
  { id: "bonus",        label: "Bonus Questions" },
  { id: "matches",      label: "Match Results" },
];

export default function AdminTabs({ players, questions, prizeConfig, matches }: Props) {
  const [tab, setTab] = useState<Tab>("participants");

  return (
    <>
      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-gray-900/60 border border-white/10 rounded-xl p-1">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
              tab === id
                ? "bg-amber-600 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab !== "matches" && (
        <AdminPanel
          players={players}
          questions={questions}
          prizeConfig={prizeConfig}
          tab={tab}
        />
      )}
      {tab === "matches" && <MatchResultsPanel matches={matches} />}
    </>
  );
}
