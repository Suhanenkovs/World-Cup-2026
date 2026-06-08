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

  const { email, name } = await request.json();
  if (!email || typeof email !== "string") {
    return Response.json({ error: "Email required" }, { status: 400 });
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/join`,
    data: { invited_at: new Date().toISOString() },
  });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Save real name immediately if provided
  if (name?.trim()) {
    await serviceClient.from("profiles")
      .update({ name: name.trim() })
      .eq("id", data.user.id);
  }

  return Response.json({ success: true, userId: data.user.id });
}
