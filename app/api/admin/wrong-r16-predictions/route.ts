import { createClient, createServiceClient } from "@/lib/supabase/server";

// Match numbers whose team assignments were wrong due to bracket mapping bug.
// Teams were swapped between M91/M93 and M92/M94 before the fix on 2026-07-04.
const AFFECTED_MATCH_NUMBERS = [91, 92, 93, 94];

async function adminGuard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return profile?.is_admin ? supabase : null;
}

// GET — list all predictions on the affected matches
export async function GET() {
  const guard = await adminGuard();
  if (!guard) return Response.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();

  const { data: affected } = await service
    .from("matches")
    .select("id, match_number")
    .in("match_number", AFFECTED_MATCH_NUMBERS);

  if (!affected?.length) return Response.json({ predictions: [] });

  const matchIds = affected.map((m) => m.id);

  const { data: predictions } = await service
    .from("predictions")
    .select("id, user_id, match_id, pred_home, pred_away, created_at, profiles(username, email), matches(match_number)")
    .in("match_id", matchIds)
    .order("match_id");

  return Response.json({ predictions: predictions ?? [] });
}

// DELETE — remove all predictions on the affected matches
export async function DELETE() {
  const guard = await adminGuard();
  if (!guard) return Response.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();

  const { data: affected } = await service
    .from("matches")
    .select("id, match_number")
    .in("match_number", AFFECTED_MATCH_NUMBERS);

  if (!affected?.length) return Response.json({ deleted: 0 });

  const matchIds = affected.map((m) => m.id);

  const { data: deleted, error } = await service
    .from("predictions")
    .delete()
    .in("match_id", matchIds)
    .select("id");

  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ deleted: deleted?.length ?? 0 });
}
