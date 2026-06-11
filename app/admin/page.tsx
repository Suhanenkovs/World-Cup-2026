import { createClient, createServiceClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminPanel from "@/components/AdminPanel";
import MatchResultsPanel from "@/components/MatchResultsPanel";
import type { MatchWithTeams } from "@/types/database";

export const revalidate = 0;

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/predictions");

  const service = createServiceClient();
  const [{ data: players }, { data: questions }, { data: config }, { data: { users } }, { data: matches }] = await Promise.all([
    supabase.from("profiles").select("*").order("joined_at", { ascending: true }),
    supabase.from("bonus_questions").select("id, question, category, max_points, correct_answer, resolved_at, created_at, answer_type, options, sort_order").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    supabase.from("prize_config").select("*").eq("id", 1).single(),
    service.auth.admin.listUsers({ perPage: 1000 }),
    supabase.from("matches").select("*, home_team:home_team_id(*), away_team:away_team_id(*)").order("scheduled_at", { ascending: true }),
  ]);

  const emailMap = Object.fromEntries((users ?? []).map((u) => [u.id, u.email ?? ""]));
  const playersWithEmail = (players ?? []).map((p) => ({ ...p, email: emailMap[p.id] ?? "" }));

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Admin Panel</h1>
      <AdminPanel
        players={playersWithEmail}
        questions={questions ?? []}
        prizeConfig={config ?? { entry_fee: 20, winner_pct: 60, second_pct: 30, third_pct: 10, fourth_pct: 0, fifth_pct: 0, id: 1 }}
      />

      <div className="mt-10">
        <h2 className="text-lg font-bold text-white mb-4">Match Results</h2>
        <MatchResultsPanel matches={(matches ?? []) as MatchWithTeams[]} />
      </div>
    </div>
  );
}
