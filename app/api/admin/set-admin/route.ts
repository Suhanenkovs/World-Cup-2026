import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { userId, isAdmin } = await request.json();

  // Prevent removing your own admin rights
  if (userId === user.id && !isAdmin) {
    return Response.json({ error: "Cannot remove your own admin rights" }, { status: 400 });
  }

  // Permanent admin — cannot be demoted by anyone
  const PERMANENT_ADMINS = ["suhinsh@inbox.lv"];
  const { data: { user: targetUser } } = await createServiceClient().auth.admin.getUserById(userId);
  if (!isAdmin && targetUser?.email && PERMANENT_ADMINS.includes(targetUser.email)) {
    return Response.json({ error: "This admin cannot be removed" }, { status: 403 });
  }

  const { error } = await createServiceClient()
    .from("profiles").update({ is_admin: isAdmin }).eq("id", userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
