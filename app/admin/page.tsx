import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminPanel from "@/components/AdminPanel";

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

  const [{ data: players }, { data: questions }, { data: config }] = await Promise.all([
    supabase.from("profiles").select("*").order("joined_at", { ascending: true }),
    supabase.from("bonus_questions").select("*").order("created_at", { ascending: true }),
    supabase.from("prize_config").select("*").eq("id", 1).single(),
  ]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Admin Panel</h1>
      <AdminPanel
        players={players ?? []}
        questions={questions ?? []}
        prizeConfig={config ?? { entry_fee: 20, winner_pct: 60, second_pct: 30, third_pct: 10, fourth_pct: 0, fifth_pct: 0, id: 1 }}
      />
    </div>
  );
}
