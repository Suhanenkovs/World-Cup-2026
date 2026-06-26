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
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await request.json();
  if (!userId || typeof userId !== "string") {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  const service = createServiceClient();
  const { data: userData, error: userError } = await service.auth.admin.getUserById(userId);
  if (userError || !userData?.user?.email) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const { data: linkData, error: linkError } = await service.auth.admin.generateLink({
    type: "recovery",
    email: userData.user.email,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password`,
    },
  });

  if (linkError) return Response.json({ error: linkError.message }, { status: 500 });

  return Response.json({ link: (linkData as any)?.properties?.action_link ?? null });
}
