import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LandingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/predictions");

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center px-4 text-center">
      <Image
        src="/world-cup-trophy.png"
        alt="FIFA World Cup Trophy"
        width={200}
        height={200}
        className="mb-6 drop-shadow-lg"
        priority
      />
      <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-8">
        FIFA World Cup 2026
      </h1>
      <Link
        href="/login"
        className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-10 py-3 rounded-lg transition-colors text-lg"
      >
        Sign in
      </Link>
    </div>
  );
}
