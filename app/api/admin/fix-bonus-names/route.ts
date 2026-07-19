import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const fixes = [
    { from: "H. Kane",  to: "Harry Kane" },
    { from: "Mbappe",   to: "Kylian Mbappé" },
    { from: "Mbappé",   to: "Kylian Mbappé" },
    { from: "Mbappe",   to: "Kylian Mbappé" },
  ];

  const results: { from: string; to: string; updated: number }[] = [];

  for (const fix of fixes) {
    const { data, error } = await service
      .from("bonus_answers")
      .update({ answer: fix.to })
      .eq("answer", fix.from)
      .select("id");
    results.push({ from: fix.from, to: fix.to, updated: error ? 0 : (data?.length ?? 0) });
  }

  return Response.json({ success: true, results });
}
