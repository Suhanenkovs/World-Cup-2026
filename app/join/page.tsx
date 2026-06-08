"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import JoinForm from "./JoinForm";

export default function JoinPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function init() {
      let session = null;

      // Case 1: existing cookie-based session
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (existing) {
        session = existing;
      }

      // Case 2: Supabase implicit flow — token in URL hash
      if (!session && typeof window !== "undefined" && window.location.hash) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (data.session) session = data.session;
        }
      }

      if (!session || cancelled) return;

      // If registration already complete, skip form
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarded")
        .eq("id", session.user.id)
        .single();

      if (profile?.onboarded) {
        router.replace("/predictions");
        return;
      }

      if (!cancelled) setReady(true);
    }

    init();
    const timer = setTimeout(() => { if (!cancelled) setTimedOut(true); }, 8000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [router]);

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
