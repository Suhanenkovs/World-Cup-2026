import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BONUS_LOCK_AT } from "@/lib/constants";
import type { BonusQuestion, BonusAnswer } from "@/types/database";
import BonusForm from "@/components/BonusForm";

export const revalidate = 0;

export default async function BonusPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: questions } = await supabase
    .from("bonus_questions")
    .select("*")
    .order("created_at", { ascending: true });

  const { data: myAnswers } = await supabase
    .from("bonus_answers")
    .select("*")
    .eq("user_id", user.id);

  const { data: teams } = await supabase
    .from("teams")
    .select("name")
    .order("name", { ascending: true });

  const answerMap = new Map<string, BonusAnswer>(
    (myAnswers ?? []).map((a) => [a.question_id, a])
  );

  const isLocked = new Date() >= BONUS_LOCK_AT;
  const totalBonus = (myAnswers ?? []).reduce((sum, a) => sum + (a.points_earned ?? 0), 0);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-white">Bonus Questions</h1>
        {totalBonus > 0 && (
          <span className="text-emerald-400 font-bold text-lg">+{totalBonus} pts</span>
        )}
      </div>
      <p className="text-gray-400 text-sm mb-6">
        {isLocked
          ? "Bonus predictions are locked — the tournament has started."
          : `All answers lock at tournament kickoff (${BONUS_LOCK_AT.toLocaleDateString()}).`}
      </p>

      <BonusForm
        questions={(questions ?? []) as BonusQuestion[]}
        answerMap={Object.fromEntries(answerMap)}
        userId={user.id}
        isLocked={isLocked}
        teamNames={(teams ?? []).map((t) => t.name)}
      />
    </div>
  );
}
