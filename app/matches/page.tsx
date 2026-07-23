import { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, STAGE_ORDER, type Stage } from "@/lib/constants";
import type { MatchWithTeams } from "@/types/database";
import MatchCard from "@/components/MatchCard";
import AutoRefresh from "@/components/AutoRefresh";
import TabSwitcher from "@/components/TabSwitcher";
import Link from "next/link";

export const revalidate = 86400;

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "results" } = await searchParams;
  const supabase = await createClient();

  const { data: matches } = await supabase
    .from("matches")
    .select("*, home_team:home_team_id(*), away_team:away_team_id(*)")
    .order("scheduled_at", { ascending: true });

  const allMatches = (matches ?? []) as MatchWithTeams[];
  const hasLive = allMatches.some((m) => m.status === "live");

  const upcomingCount = allMatches.filter((m) => m.status === "scheduled").length;
  const resultsCount  = allMatches.filter((m) => m.status === "finished" || m.status === "live").length;

  const filtered = allMatches.filter((m) =>
    tab === "results"
      ? m.status === "finished" || m.status === "live"
      : m.status === "scheduled"
  );

  const byStage = new Map<string, MatchWithTeams[]>();
  for (const m of filtered) {
    const list = byStage.get(m.stage) ?? [];
    list.push(m);
    byStage.set(m.stage, list);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {hasLive && <AutoRefresh />}
      <h1 className="text-2xl font-bold text-white mb-6">Match Schedule</h1>

      <TabSwitcher
        tabs={[
          { key: "upcoming", label: "Upcoming", count: upcomingCount },
          { key: "results",  label: "Results",  count: resultsCount, live: hasLive },
        ]}
        activeTab={tab}
        basePath="/matches"
      />

      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-gray-400 text-sm">
            {tab === "upcoming"
              ? "All matches have been played."
              : "No results yet — the tournament hasn't started."}
          </p>
          <Link
            href={`/matches?tab=${tab === "upcoming" ? "results" : "upcoming"}`}
            className="mt-3 inline-block text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            {tab === "upcoming" ? "View results →" : "View upcoming matches →"}
          </Link>
        </div>
      ) : (
        STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => (
          <section key={stage} className="mb-10">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-emerald-400">
              {STAGE_LABELS[stage as Stage]}
            </h2>
            <div className="flex flex-col gap-2">
              {byStage.get(stage)!.map((match) => (
                <MatchCard key={match.id} match={match} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
