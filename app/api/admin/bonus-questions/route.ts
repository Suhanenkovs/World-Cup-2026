import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  return profile?.is_admin ? supabase : null;
}

// POST — create question
export async function POST(req: NextRequest) {
  const supabase = await requireAdmin();
  if (!supabase) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { question, category, max_points, answer_type, options, sort_order } = body;

  if (!question?.trim() || !category?.trim() || !max_points) {
    return Response.json({ error: "question, category and max_points are required" }, { status: 400 });
  }

  const { data, error } = await createServiceClient()
    .from("bonus_questions")
    .insert({
      question: question.trim(),
      category: category.trim(),
      max_points: parseInt(max_points),
      answer_type: answer_type ?? "text",
      options: options?.length ? options : null,
      sort_order: sort_order ?? 0,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true, question: data });
}

// PATCH — update question
export async function PATCH(req: NextRequest) {
  const supabase = await requireAdmin();
  if (!supabase) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id, ...fields } = await req.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const update: Record<string, unknown> = {};
  if (fields.question !== undefined) update.question = fields.question.trim();
  if (fields.category !== undefined) update.category = fields.category.trim();
  if (fields.max_points !== undefined) update.max_points = parseInt(fields.max_points);
  if (fields.answer_type !== undefined) update.answer_type = fields.answer_type;
  if (fields.options !== undefined) update.options = fields.options?.length ? fields.options : null;
  if (fields.sort_order !== undefined) update.sort_order = fields.sort_order;

  const { error } = await createServiceClient()
    .from("bonus_questions")
    .update(update)
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}

// DELETE — delete question
export async function DELETE(req: NextRequest) {
  const supabase = await requireAdmin();
  if (!supabase) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const { error } = await createServiceClient()
    .from("bonus_questions")
    .delete()
    .eq("id", id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
