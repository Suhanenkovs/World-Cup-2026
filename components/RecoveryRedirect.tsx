"use client";

import { useEffect } from "react";

// Handles the token-based recovery link format from Supabase dashboard:
// supabase.co/auth/v1/verify?type=recovery&redirect_to=<site-url>
// After verification Supabase appends #access_token=...&type=recovery to the
// redirect_to URL. Since the hash is client-only, the server can't detect it —
// this component catches it on any page and sends the user to /reset-password.
export default function RecoveryRedirect() {
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      window.location.replace("/reset-password" + hash);
    } else if (hash.includes("error=")) {
      const params = new URLSearchParams(hash.slice(1));
      const desc = params.get("error_description") ?? "The link is invalid or has expired.";
      window.location.replace("/login?auth_error=" + encodeURIComponent(desc));
    }
  }, []);
  return null;
}
