"use client";

import { useState } from "react";
import AdminPanel from "./AdminPanel";
import MatchResultsPanel from "./MatchResultsPanel";
import type { Profile, BonusQuestion, MatchWithTeams } from "@/types/database";

type Tab = "participants" | "bonus" | "matches";

interface PrizeConfig {
  id: number;
  entry_fee: number;
  admin_cost: number;
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
      <div className="flex border-b border-white/10 mb-8">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px mr-8 pb-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === id
                ? "border-emerald-400 text-white"
                : "border-transparent text-gray-500 hover:text-gray-300"
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
