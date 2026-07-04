import { createClient, createServiceClient } from "@/lib/supabase/server";
import { promoteBracket } from "@/lib/bracket";

// One-shot endpoint to force-correct bracket slots (overwrites wrong promotions).
// Safe to call multiple times — idempotent once slots are correct.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();
  const promoted = await promoteBracket(service, true);
  return Response.json({ promoted });
}
