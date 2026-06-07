import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { questionId, correctAnswer } = await request.json();
  const service = createServiceClient();

  // Mark question resolved
  await service
    .from("bonus_questions")
    .update({ correct_answer: correctAnswer, resolved_at: new Date().toISOString() })
    .eq("id", questionId);

  // Score all answers: exact match (case-insensitive) = full points
  const { data: q } = await service
    .from("bonus_questions")
    .select("max_points")
    .eq("id", questionId)
    .single();

  const { data: answers } = await service
    .from("bonus_answers")
    .select("id, answer")
    .eq("question_id", questionId);

  const normalised = correctAnswer.trim().toLowerCase();

  for (const a of answers ?? []) {
    const pts = a.answer.trim().toLowerCase() === normalised ? q!.max_points : 0;
    await service.from("bonus_answers").update({ points_earned: pts }).eq("id", a.id);
  }

  return Response.json({ success: true, resolved: answers?.length ?? 0 });
}
