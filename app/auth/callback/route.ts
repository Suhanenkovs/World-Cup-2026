import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? (type === "recovery" ? "/reset-password" : "/join");

  if (!code) {
    return NextResponse.redirect(new URL(`${next}?auth_error=no_code`, request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const msg = encodeURIComponent(error.message.slice(0, 80));
    return NextResponse.redirect(new URL(`${next}?auth_error=${msg}`, request.url));
  }

  return NextResponse.redirect(`${origin}${next}`);
}
