"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    // Token-based flow (Supabase dashboard reset links):
    // After verify, Supabase redirects with #access_token=...&type=recovery in the hash.
    // @supabase/ssr browser clients don't auto-process hash tokens, so we do it manually.
    const hash = window.location.hash.slice(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
          .then(({ error }) => { if (!error) setReady(true); });
        return;
      }
    }

    // PKCE flow: session already set via cookies by /auth/callback
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Passwords do not match."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }

    const supabase = createClient();
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(err.message); return; }
    setDone(true);
    setTimeout(() => router.push("/predictions"), 2000);
  }

  if (done) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-emerald-400 text-lg font-semibold">Password updated!</p>
          <p className="text-gray-400 text-sm mt-1">Redirecting…</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <p className="text-gray-400 text-sm">Verifying reset link…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/world-cup-trophy.png" alt="" className="w-20 h-20 object-contain mx-auto mb-3" />
          <h1 className="text-2xl font-bold text-white">Set new password</h1>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-xl border border-gray-800 p-6 flex flex-col gap-4">
          {error && (
            <div className="bg-red-900/40 border border-red-700 text-red-300 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-300">New password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              placeholder="Min. 8 characters"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-300">Confirm password</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 rounded-lg transition-colors"
          >
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
