import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { userId, name } = await request.json();
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  const { error } = await createServiceClient()
    .from("profiles").update({ name: name?.trim() || null }).eq("id", userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
