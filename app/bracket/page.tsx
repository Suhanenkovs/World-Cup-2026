import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { MatchWithTeams, Team } from "@/types/database";
import { getFlagUrl } from "@/lib/teamFlags";

export const revalidate = 60;

// ── Shared helpers ─────────────────────────────────────────────────────────

function Flag({ team }: { team: Team | null | undefined }) {
  if (!team) return null;
  const src = team.flag_url ?? getFlagUrl(team.name);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={team.name} className="w-4 h-3 object-cover rounded-sm border border-gray-700 shrink-0" />;
}

function TeamRow({ team, score }: { team: Team | null | undefined; score: number | null }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Flag team={team} />
      <span className={`text-[10px] font-medium truncate leading-tight ${team ? "text-white" : "text-gray-600"}`}>
        {team?.short_name ?? team?.name ?? "TBD"}
      </span>
      {score !== null && (
        <span className="ml-auto text-[10px] font-bold text-white shrink-0 pl-1">{score}</span>
      )}
    </div>
  );
}

function MatchCard({ match, highlight }: { match: MatchWithTeams | undefined; highlight?: boolean }) {
  const hasScore = match && match.home_score !== null;
  return (
    <div className={`w-28 rounded-md border text-[10px] shrink-0 overflow-hidden
      ${match ? "bg-gray-900/50 border-white/10" : "bg-gray-900/30 border-gray-800/40"}
      ${highlight ? "ring-1 ring-amber-500/60" : ""}`}>
      {match ? (
        <div className="px-2 py-1 flex flex-col gap-px">
          <TeamRow team={match.home_team} score={hasScore ? match.home_score : null} />
          <div className="border-t border-gray-800" />
          <TeamRow team={match.away_team} score={hasScore ? match.away_score : null} />
        </div>
      ) : (
        <div className="px-2 py-1 flex flex-col gap-px">
          <span className="text-gray-700 text-[9px]">TBD</span>
          <div className="border-t border-gray-800" />
          <span className="text-gray-700 text-[9px]">TBD</span>
        </div>
      )}
    </div>
  );
}

// ── Desktop bracket components ─────────────────────────────────────────────

// A column of N matches, each given an equal flex-1 vertical slot so spacing doubles each round
function RoundCol({ matches }: { matches: (MatchWithTeams | undefined)[] }) {
  return (
    <div className="flex flex-col shrink-0 w-28">
      {matches.map((m, i) => (
        <div key={i} className="flex-1 flex items-center">
          <MatchCard match={m} />
        </div>
      ))}
    </div>
  );
}

// Bracket arms feeding left → right (left side of bracket)
function LeftConn({ arms }: { arms: number }) {
  return (
    <div className="flex flex-col w-4 shrink-0">
      {Array.from({ length: arms }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col">
          <div className="flex-1 border-r-2 border-b-2 border-gray-700 rounded-br-sm" />
          <div className="flex-1 border-r-2 border-t-2 border-gray-700 rounded-tr-sm" />
        </div>
      ))}
    </div>
  );
}

// Bracket arms feeding right → left (right side of bracket)
function RightConn({ arms }: { arms: number }) {
  return (
    <div className="flex flex-col w-4 shrink-0">
      {Array.from({ length: arms }).map((_, i) => (
        <div key={i} className="flex-1 flex flex-col">
          <div className="flex-1 border-l-2 border-b-2 border-gray-700 rounded-bl-sm" />
          <div className="flex-1 border-l-2 border-t-2 border-gray-700 rounded-tl-sm" />
        </div>
      ))}
    </div>
  );
}

// Horizontal line connecting SF to Final — sits at Y=50% via flex items-center
function HorizLine() {
  return (
    <div className="self-stretch flex items-center w-6 shrink-0">
      <div className="w-full border-t-2 border-gray-700" />
    </div>
  );
}

// Center column: trophy at top, Final at Y=50%, 3rd place below
function CenterCol({ final: finalMatch, third }: {
  final: MatchWithTeams | undefined;
  third: MatchWithTeams | undefined;
}) {
  return (
    <div className="flex flex-col items-center shrink-0 w-36">
      {/* Top half — pushes Final card to the vertical center */}
      <div className="flex-1 flex flex-col items-center justify-end pb-3 gap-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/world-cup-trophy.png" alt="Trophy" className="w-10 h-10 object-contain opacity-90" />
        <span className="text-[9px] text-amber-400 font-bold uppercase tracking-widest">Final</span>
      </div>
      {/* Final card — centered at Y=50% of bracket height */}
      <div className="shrink-0">
        <MatchCard match={finalMatch} highlight />
      </div>
      {/* Bottom half */}
      <div className="flex-1 flex flex-col items-center justify-start pt-3 gap-1">
        <span className="text-[9px] text-gray-500 font-semibold uppercase">3rd Place</span>
        <MatchCard match={third} />
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function BracketPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: matches } = await supabase
    .from("matches")
    .select("*, home_team:home_team_id(*), away_team:away_team_id(*)")
    .in("stage", ["round_of_32", "round_of_16", "quarterfinal", "semifinal", "final", "third_place"])
    .order("match_number", { ascending: true });

  const all = (matches ?? []) as MatchWithTeams[];
  const r32  = all.filter((m) => m.stage === "round_of_32");
  const r16  = all.filter((m) => m.stage === "round_of_16");
  const qf   = all.filter((m) => m.stage === "quarterfinal");
  const sf   = all.filter((m) => m.stage === "semifinal");
  const finalMatch = all.find((m) => m.stage === "final");
  const third      = all.find((m) => m.stage === "third_place");

  function pad(arr: MatchWithTeams[], n: number): (MatchWithTeams | undefined)[] {
    return [...arr, ...Array(Math.max(0, n - arr.length)).fill(undefined)];
  }

  const r32L = pad(r32.slice(0, 8), 8);
  const r32R = pad(r32.slice(8),    8);
  const r16L = pad(r16.slice(0, 4), 4);
  const r16R = pad(r16.slice(4),    4);
  const qfL  = pad(qf.slice(0, 2),  2);
  const qfR  = pad(qf.slice(2),     2);
  const sfL  = sf[0];
  const sfR  = sf[1];

  // Desktop label row widths must exactly match the bracket column widths below
  const labelCols = [
    { w: 112, label: "Round of 32"   },
    { w: 16,  label: ""              },
    { w: 112, label: "Round of 16"   },
    { w: 16,  label: ""              },
    { w: 112, label: "Quarterfinals" },
    { w: 16,  label: ""              },
    { w: 112, label: "Semifinals"    },
    { w: 24,  label: ""              },
    { w: 144, label: "Final"         },
    { w: 24,  label: ""              },
    { w: 112, label: "Semifinals"    },
    { w: 16,  label: ""              },
    { w: 112, label: "Quarterfinals" },
    { w: 16,  label: ""              },
    { w: 112, label: "Round of 16"   },
    { w: 16,  label: ""              },
    { w: 112, label: "Round of 32"   },
  ];

  const totalW = labelCols.reduce((s, c) => s + c.w, 0);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Knockout Stage</h1>

      {/* ── Desktop full bracket tree ──────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto pb-6">

        {/* Round labels */}
        <div className="flex mb-2" style={{ minWidth: totalW }}>
          {labelCols.map((col, i) => (
            <div
              key={i}
              style={{ width: col.w, flexShrink: 0 }}
              className="text-center text-[9px] text-amber-400/60 font-semibold uppercase tracking-wider truncate"
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* Bracket tree — all columns share the same height via items-stretch */}
        <div className="flex items-stretch" style={{ minWidth: totalW, height: 640 }}>

          {/* Left bracket: R32 → R16 → QF → SF */}
          <RoundCol matches={r32L} />
          <LeftConn arms={4} />
          <RoundCol matches={r16L} />
          <LeftConn arms={2} />
          <RoundCol matches={qfL} />
          <LeftConn arms={1} />
          <RoundCol matches={[sfL]} />

          {/* SF left → Final */}
          <HorizLine />

          {/* Center */}
          <CenterCol final={finalMatch} third={third} />

          {/* Final → SF right */}
          <HorizLine />

          {/* Right bracket: SF → QF → R16 → R32 */}
          <RoundCol matches={[sfR]} />
          <RightConn arms={1} />
          <RoundCol matches={qfR} />
          <RightConn arms={2} />
          <RoundCol matches={r16R} />
          <RightConn arms={4} />
          <RoundCol matches={r32R} />

        </div>
      </div>

      {/* ── Mobile: not available ─────────────────────────────────────── */}
      <div className="md:hidden flex flex-col items-center gap-4 py-16 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/world-cup-trophy.png" alt="Trophy" className="w-16 h-16 object-contain opacity-60" />
        <p className="text-gray-400 text-sm">Open on a larger screen to view the bracket.</p>
      </div>
    </div>
  );
}
