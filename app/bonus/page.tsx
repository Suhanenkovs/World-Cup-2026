import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BONUS_LOCK_AT } from "@/lib/constants";
import type { BonusQuestion, BonusAnswer } from "@/types/database";
import BonusForm from "@/components/BonusForm";
import BonusAllAnswers from "@/components/BonusAllAnswers";

export const revalidate = 0;

export default async function BonusPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "all" ? "all" : "mine";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: questions } = await supabase
    .from("bonus_questions")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  const { data: myAnswers } = await supabase
    .from("bonus_answers")
    .select("*")
    .eq("user_id", user.id);

  const { data: teams } = await supabase
    .from("teams")
    .select("name")
    .order("name", { ascending: true });

  const answerMap = Object.fromEntries(
    (myAnswers ?? []).map((a) => [a.question_id, a])
  );
  const isLocked = new Date() >= BONUS_LOCK_AT;
  const totalBonus = (myAnswers ?? []).reduce((s, a) => s + (a.points_earned ?? 0), 0);

  // For "All answers" tab: fetch all answers with profile names
  let allAnswers: { user_id: string; question_id: string; answer: string; points_earned: number | null; profiles: { name: string | null; username: string } | null }[] = [];
  let players: { id: string; name: string | null; username: string }[] = [];

  if (activeTab === "all") {
    const { data } = await supabase
      .from("bonus_answers")
      .select("user_id, question_id, answer, points_earned, profiles(name, username)");
    allAnswers = (data ?? []) as unknown as typeof allAnswers;

    // Collect unique players
    const seen = new Set<string>();
    for (const a of allAnswers) {
      if (!seen.has(a.user_id)) {
        seen.add(a.user_id);
        players.push({ id: a.user_id, name: a.profiles?.name ?? null, username: a.profiles?.username ?? a.user_id });
      }
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Bonus Questions</h1>
        {totalBonus > 0 && activeTab === "mine" && (
          <span className="text-emerald-400 font-bold text-lg">+{totalBonus} pts</span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-900 border border-gray-800 rounded-lg p-1 w-fit">
        <a
          href="/bonus"
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "mine" ? "bg-amber-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          My Answers
        </a>
        <a
          href="/bonus?tab=all"
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === "all" ? "bg-amber-600 text-white" : "text-gray-400 hover:text-white"
          }`}
        >
          All Answers
        </a>
      </div>

      {activeTab === "mine" ? (
        <>
          <p className="text-gray-400 text-sm mb-6">
            {isLocked
              ? "Bonus predictions are locked — the tournament has started."
              : `All answers lock at tournament kickoff (${BONUS_LOCK_AT.toLocaleDateString()}).`}
          </p>
          <BonusForm
            questions={(questions ?? []) as BonusQuestion[]}
            answerMap={answerMap as Record<string, BonusAnswer>}
            userId={user.id}
            isLocked={isLocked}
            teamNames={(teams ?? []).map((t) => t.name)}
          />
        </>
      ) : (
        <BonusAllAnswers
          questions={(questions ?? []) as BonusQuestion[]}
          allAnswers={allAnswers}
          players={players}
        />
      )}
    </div>
  );
}
