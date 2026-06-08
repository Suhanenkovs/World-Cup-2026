"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import JoinForm from "./JoinForm";

export default function JoinPage() {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Handles hash-based implicit flow: #access_token=... fires SIGNED_IN
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setReady(true);
    });

    // Also covers cookie-based sessions (e.g. user navigates back to /join)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    const timer = setTimeout(() => setTimedOut(true), 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timer);
    };
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
