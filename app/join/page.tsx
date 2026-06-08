"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import JoinForm from "./JoinForm";

export default function JoinPage() {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function init() {
      // Case 1: session already in cookies (PKCE callback flow)
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (existing) { if (!cancelled) setReady(true); return; }

      // Case 2: Supabase implicit flow — token is in the URL hash
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (data.session && !cancelled) { setReady(true); return; }
        }
      }
    }

    init();
    const timer = setTimeout(() => { if (!cancelled) setTimedOut(true); }, 8000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center space-y-3">
          {timedOut ? (
            <>
              <p className="text-red-400 font-medium">Invite link verification failed.</p>
              <p className="text-gray-400 text-sm">
                The link may have expired or already been used.<br />
                Ask an admin to send a new invite.
              </p>
              <a href="/login" className="text-emerald-400 text-sm underline">Go to login</a>
            </>
          ) : (
            <p className="text-gray-400">Verifying invite link…</p>
          )}
        </div>
      </div>
    );
  }

  return <JoinForm />;
}
