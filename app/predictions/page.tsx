import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { STAGE_LABELS, STAGE_ORDER, POINTS_CORRECT_RESULT, POINTS_GOAL_DIFF, POINTS_EXACT_SCORE, type Stage } from "@/lib/constants";
import type { MatchWithTeams, Prediction } from "@/types/database";
import PredictionsGrid from "@/components/PredictionsGrid";
import TabSwitcher from "@/components/TabSwitcher";
import Link from "next/link";

export const revalidate = 86400;

export default async function PredictionsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "results" } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("paid, username, name")
    .eq("id", user.id)
    .single();

  const { data: matches } = await supabase
    .from("matches")
    .select("*, home_team:home_team_id(*), away_team:away_team_id(*)")
    .order("scheduled_at", { ascending: true });

  const { data: myPredictions } = await supabase
    .from("predictions")
    .select("*")
    .eq("user_id", user.id);

  const predMap = new Map<string, Prediction>(
    (myPredictions ?? []).map((p) => [p.match_id, p])
  );

  const allMatches = (matches ?? []) as MatchWithTeams[];
  const hasLive = allMatches.some((m) => m.status === "live");

  const upcomingCount = allMatches.filter((m) => m.status === "scheduled").length;
  const resultsCount  = allMatches.filter((m) => m.status === "finished" || m.status === "live").length;

  const filtered = allMatches
    .filter((m) =>
      tab === "results"
        ? m.status === "finished" || m.status === "live"
        : m.status === "scheduled"
    )
    .sort((a, b) =>
      tab === "results"
        ? new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
        : 0
    );

  const byStage = new Map<string, MatchWithTeams[]>();
  for (const m of filtered) {
    const list = byStage.get(m.stage) ?? [];
    list.push(m);
    byStage.set(m.stage, list);
  }

  const totalPoints = (myPredictions ?? [])
    .reduce((sum, p) => sum + (p.points_earned ?? 0), 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">My Predictions</h1>
          <p className="text-sm text-gray-400 mt-1">
            Hi, {(profile as any)?.name || profile?.username}! Edit your picks up until each match kicks off.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-2 text-center">
            <div className="text-xs text-gray-400">Points</div>
            <div className="text-xl font-bold text-emerald-400">{totalPoints}</div>
          </div>
          <Link
            href="/predictions/bonus"
            className="bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Bonus Questions
          </Link>
        </div>
      </div>

      {!profile?.paid && (
        <div className="bg-amber-900/40 border border-amber-700 text-amber-300 rounded-xl px-4 py-3 mb-6 text-sm">
          Your entry fee has not been confirmed yet. Contact the admin to get marked as paid.
        </div>
      )}

      <TabSwitcher
        tabs={[
          { key: "upcoming", label: "Upcoming", count: upcomingCount },
          { key: "results",  label: "Results",  count: resultsCount, live: hasLive },
        ]}
        activeTab={tab}
        basePath="/predictions"
      />

      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-400 text-sm">
            {tab === "upcoming"
              ? "All picks are locked — no matches left to predict."
              : "Results appear here once matches are played."}
          </p>
          <Link
            href={`/predictions?tab=${tab === "upcoming" ? "results" : "upcoming"}`}
            className="mt-3 inline-block text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            {tab === "upcoming" ? "See your results →" : "Make your picks →"}
          </Link>
        </div>
      ) : (
        (tab === "results" ? [...STAGE_ORDER].reverse() : STAGE_ORDER).filter((s) => byStage.has(s)).map((stage) => (
          <section key={`${stage}-${tab}`} className="mb-10">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-400">
              {STAGE_LABELS[stage as Stage]}
            </h2>
            <PredictionsGrid
              matches={byStage.get(stage)!}
              predictions={Object.fromEntries(predMap)}
              stage={stage as Stage}
              userId={user.id}
              isPaid={profile?.paid ?? false}
            />
          </section>
        ))
      )}

      <div className="text-xs text-gray-500 mt-8 bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-800">
        <span className="font-semibold text-gray-300 block mb-2">Scoring</span>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5">
          {STAGE_ORDER.map((s) => (
            <div key={s}>
              <span className="text-gray-300 font-medium">{STAGE_LABELS[s as Stage]}</span>
              <div>correct result: <span className="text-emerald-400">{POINTS_CORRECT_RESULT[s as Stage]}pts</span></div>
              <div>goal difference: <span className="text-emerald-400">{POINTS_GOAL_DIFF[s as Stage]}pts</span></div>
              <div>exact score: <span className="text-emerald-400">{POINTS_EXACT_SCORE[s as Stage]}pts</span></div>
            </div>
          ))}
        </div>
        <p className="mt-3 pt-3 border-t border-gray-800 text-gray-600">
          Knockout stage scores are judged after <span className="text-gray-400">90 minutes only</span> (regulation time). Extra time and penalties do not count.
        </p>
      </div>
    </div>
  );
}
