"use client";

import { useEffect } from "react";

// Handles the token-based recovery link format from Supabase dashboard:
// supabase.co/auth/v1/verify?type=recovery&redirect_to=<site-url>
// After verification Supabase appends #access_token=...&type=recovery to the
// redirect_to URL. Since the hash is client-only, the server can't detect it —
// this component catches it on any page and sends the user to /reset-password.
export default function RecoveryRedirect() {
  useEffect(() => {
    if (window.location.hash.includes("type=recovery")) {
      window.location.replace("/reset-password" + window.location.hash);
    }
  }, []);
  return null;
}
