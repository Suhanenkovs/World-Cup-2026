"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

const NAV_LINKS = [
  { href: "/groups",      label: "Groups",       mobileHide: false },
  { href: "/bracket",     label: "Bracket",      mobileHide: true  },
  { href: "/matches",     label: "Matches",      mobileHide: false },
  { href: "/predictions", label: "My Picks",     mobileHide: false },
  { href: "/bonus",       label: "Bonus",        mobileHide: false },
  { href: "/leaderboard", label: "Leaderboard",  mobileHide: false },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser(userId: string | undefined) {
      if (!userId) { setIsAdmin(false); return; }
      const { data: profile } = await supabase
        .from("profiles").select("is_admin").eq("id", userId).single();
      setIsAdmin(profile?.is_admin ?? false);
    }

    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      loadUser(data.user?.id);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      loadUser(session?.user?.id);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const isAuth = !!user;

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/world-cup-trophy.png" alt="" className="w-7 h-7 object-contain" />
          <span className="sm:hidden">World Cup 2026</span>
          <span className="hidden sm:inline">FIFA World Cup 2026</span>
        </Link>

        {isAuth && (
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname.startsWith(href)
                    ? "bg-emerald-600 text-white"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {label}
              </Link>
            ))}
            {isAdmin && (
              <Link
                href="/admin"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname.startsWith("/admin")
                    ? "bg-amber-600 text-white"
                    : "text-amber-400 hover:bg-gray-800"
                }`}
              >
                Admin
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center gap-2">
          {isAuth && (
            <button
              onClick={handleSignOut}
              className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1.5 rounded-md hover:bg-gray-800"
            >
              Sign out
            </button>
          )}

          {isAuth && (
            <button
              className="md:hidden p-2 text-gray-400 hover:text-white"
              onClick={() => setOpen((o) => !o)}
              aria-label="Menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          )}
        </div>
      </div>

      {open && isAuth && (
        <div className="md:hidden border-t border-gray-800 px-4 py-2 flex flex-col gap-1">
          {NAV_LINKS.filter((l) => !l.mobileHide).map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className={`px-3 py-2 rounded-md text-sm font-medium ${
                pathname.startsWith(href)
                  ? "bg-emerald-600 text-white"
                  : "text-gray-300 hover:bg-gray-800"
              }`}
            >
              {label}
            </Link>
          ))}
          {isAdmin && (
            <Link href="/admin" onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-md text-sm font-medium text-amber-400 hover:bg-gray-800">
              Admin
            </Link>
          )}
        </div>
      )}
    </nav>
  );
}
