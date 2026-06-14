import { createClient } from "@/lib/supabase/server";
import { STAGE_LABELS, STAGE_ORDER, type Stage } from "@/lib/constants";
import type { MatchWithTeams } from "@/types/database";
import MatchCard from "@/components/MatchCard";
import AutoRefresh from "@/components/AutoRefresh";
import TabSwitcher from "@/components/TabSwitcher";

export const revalidate = 60;

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab = "upcoming" } = await searchParams;
  const supabase = await createClient();

  const { data: matches } = await supabase
    .from("matches")
    .select("*, home_team:home_team_id(*), away_team:away_team_id(*)")
    .order("scheduled_at", { ascending: true });

  const allMatches = (matches ?? []) as MatchWithTeams[];
  const hasLive = allMatches.some((m) => m.status === "live");

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
          { key: "upcoming", label: "Upcoming" },
          { key: "results", label: "Results", live: hasLive },
        ]}
        activeTab={tab}
        basePath="/matches"
      />

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          {tab === "upcoming" ? "No upcoming matches." : "No results yet."}
        </p>
      ) : (
        STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => (
          <section key={stage} className="mb-10">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-emerald-400 mb-3">
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
