import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return profile?.is_admin ? true : null;
}

// GET /api/admin/bonus-answers?questionId=...
// Returns all answers for a question with user display names
export async function GET(req: NextRequest) {
  if (!await requireAdmin()) return Response.json({ error: "Forbidden" }, { status: 403 });

  const questionId = req.nextUrl.searchParams.get("questionId");
  if (!questionId) return Response.json({ error: "questionId required" }, { status: 400 });

  const service = createServiceClient();
  const { data, error } = await service
    .from("bonus_answers")
    .select("id, answer, points_earned, user_id, profiles(name, username)")
    .eq("question_id", questionId)
    .order("answer", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ answers: data ?? [] });
}

// PATCH /api/admin/bonus-answers
// Updates the text of a specific answer row
export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, answer } = await req.json();
  if (!id || !answer?.trim()) return Response.json({ error: "id and answer required" }, { status: 400 });

  const { error } = await createServiceClient()
    .from("bonus_answers")
    .update({ answer: answer.trim() })
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
