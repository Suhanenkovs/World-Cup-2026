import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const PERMANENT_ADMINS = ["k.suhanenkovs@inbox.lv"];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await request.json();
  if (!userId) return Response.json({ error: "userId required" }, { status: 400 });

  // Cannot delete yourself
  if (userId === user.id) {
    return Response.json({ error: "Cannot delete yourself" }, { status: 400 });
  }

  const service = createServiceClient();

  // Cannot delete permanent admins
  const { data: { user: target } } = await service.auth.admin.getUserById(userId);
  if (target?.email && PERMANENT_ADMINS.includes(target.email)) {
    return Response.json({ error: "Cannot delete this user" }, { status: 403 });
  }

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
