import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { MatchWithTeams, Team } from "@/types/database";
import { getFlagUrl } from "@/lib/teamFlags";
import Link from "next/link";

export const revalidate = 60;

// ── Shared helpers ─────────────────────────────────────────────────────────

function Flag({ team }: { team: Team | null | undefined }) {
  if (!team) return null;
  const src = getFlagUrl(team.name) ?? team.flag_url;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={team.name} className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />;
}

function TeamRow({ team, score, won }: { team: Team | null | undefined; score: number | null; won?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Flag team={team} />
      <span className={`text-xs font-medium truncate leading-tight ${team ? "text-white" : "text-gray-600"}`}>
        {team?.short_name ?? team?.name ?? "TBD"}
      </span>
      {score !== null && (
        <span className={`ml-auto text-xs font-bold shrink-0 pl-1 ${won ? "text-emerald-400" : "text-white"}`}>{score}</span>
      )}
    </div>
  );
}

function MatchCard({ match, highlight }: { match: MatchWithTeams | undefined; highlight?: boolean }) {
  const hasScore = match && match.home_score !== null;
  const decidedByPens = match?.score_duration === "PENALTY_SHOOTOUT";
  const decidedByET = match?.score_duration === "EXTRA_TIME";
  const homeWonPens = decidedByPens && (match!.penalties_home ?? 0) > (match!.penalties_away ?? 0);
  const homeWonET = decidedByET && (match!.home_score_et ?? 0) > (match!.away_score_et ?? 0);
  const awayWonET = decidedByET && (match!.away_score_et ?? 0) > (match!.home_score_et ?? 0);
  const hasETScores = match?.home_score_et !== null && match?.home_score_et !== undefined
    && match?.away_score_et !== null && match?.away_score_et !== undefined;

  const cls = `w-36 rounded-md border shrink-0 overflow-hidden
    ${match ? "bg-gray-900/50 border-white/10 hover:border-white/30 transition-colors" : "bg-gray-900/30 border-gray-800/40"}
    ${highlight ? "ring-1 ring-amber-500/60" : ""}`;

  const content = match ? (
    <div className="px-2.5 py-1.5 flex flex-col gap-0.5">
      <TeamRow team={match.home_team} score={hasScore ? match.home_score : null} won={(decidedByPens && homeWonPens) || homeWonET} />
      <div className="border-t border-gray-800" />
      <TeamRow team={match.away_team} score={hasScore ? match.away_score : null} won={(decidedByPens && !homeWonPens) || awayWonET} />
      {decidedByPens && (
        <span className="text-[9px] text-amber-400 font-semibold text-center mt-0.5">
          pens {match.penalties_home}–{match.penalties_away}
        </span>
      )}
      {decidedByET && (
        <span className="text-[9px] text-amber-400 font-semibold text-center mt-0.5">
          {hasETScores ? `${match.home_score_et}–${match.away_score_et} AET` : "AET"}
        </span>
      )}
    </div>
  ) : (
    <div className="px-2.5 py-1.5 flex flex-col gap-0.5">
      <span className="text-gray-700 text-[10px]">TBD</span>
      <div className="border-t border-gray-800" />
      <span className="text-gray-700 text-[10px]">TBD</span>
    </div>
  );

  if (match) {
    return <Link href={`/matches/${match.id}`} className={cls}>{content}</Link>;
  }
  return <div className={cls}>{content}</div>;
}

// ── Desktop bracket components ─────────────────────────────────────────────

// A column of N matches, each given an equal flex-1 vertical slot so spacing doubles each round
function RoundCol({ matches }: { matches: (MatchWithTeams | undefined)[] }) {
  return (
    <div className="flex flex-col shrink-0 w-36">
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
    <div className="flex flex-col items-center shrink-0 w-44">
      {/* Top half — pushes Final card to the vertical center */}
      <div className="flex-1 flex flex-col items-center justify-end pb-2 gap-1 min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/world-cup-trophy.png" alt="Trophy" className="flex-1 w-full object-contain opacity-95 min-h-0" />
        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest shrink-0">Final</span>
      </div>
      {/* Final card — centered at Y=50% of bracket height */}
      <div className="shrink-0">
        <MatchCard match={finalMatch} highlight />
      </div>
      {/* Bottom half */}
      <div className="flex-1 flex flex-col items-center justify-start pt-3 gap-1">
        <span className="text-[10px] text-gray-500 font-semibold uppercase">3rd Place</span>
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
  const byNum = new Map(all.filter((m) => m.match_number != null).map((m) => [m.match_number as number, m]));
  const finalMatch = all.find((m) => m.stage === "final");
  const third      = all.find((m) => m.stage === "third_place");

  // Pick matches by official match number for correct bracket tree alignment.
  // Verified against ESPN bracket (espn.com/soccer/bracket) July 2026.
  // Left side feeds into SF M101; right side feeds into SF M102.
  //
  // Left R32 pairs:  [M74,M77]→M89  [M73,M75]→M90  [M76,M78]→M93  [M79,M80]→M94
  // Left R16:        M89, M90 → QF M97  |  M93, M94 → QF M98  → SF M101
  //
  // Right R32 pairs: [M83,M84]→M91  [M81,M82]→M92  [M86,M88]→M95  [M85,M87]→M96
  // Right R16:       M91, M92 → QF M99  |  M95, M96 → QF M100  → SF M102
  const r32L = [74, 77, 73, 75, 76, 78, 79, 80].map((n) => byNum.get(n));
  const r16L = [89, 90, 93, 94].map((n) => byNum.get(n));
  const qfL  = [97, 98].map((n) => byNum.get(n));
  const sfL  = byNum.get(101);

  const sfR  = byNum.get(102);
  const qfR  = [99, 100].map((n) => byNum.get(n));
  const r16R = [91, 92, 95, 96].map((n) => byNum.get(n));
  const r32R = [83, 84, 81, 82, 86, 88, 85, 87].map((n) => byNum.get(n));

  // Desktop label row widths must exactly match the bracket column widths below
  // RoundCol = w-36 (144px), Conn = w-4 (16px), HorizLine = w-6 (24px), CenterCol = w-44 (176px)
  const labelCols = [
    { w: 144, label: "Round of 32"   },
    { w: 16,  label: ""              },
    { w: 144, label: "Round of 16"   },
    { w: 16,  label: ""              },
    { w: 144, label: "Quarterfinals" },
    { w: 16,  label: ""              },
    { w: 144, label: "Semifinals"    },
    { w: 24,  label: ""              },
    { w: 176, label: "Final"         },
    { w: 24,  label: ""              },
    { w: 144, label: "Semifinals"    },
    { w: 16,  label: ""              },
    { w: 144, label: "Quarterfinals" },
    { w: 16,  label: ""              },
    { w: 144, label: "Round of 16"   },
    { w: 16,  label: ""              },
    { w: 144, label: "Round of 32"   },
  ];

  const totalW = labelCols.reduce((s, c) => s + c.w, 0);

  return (
    <div className="max-w-screen-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-6">Knockout Stage</h1>

      {/* ── Desktop full bracket tree ──────────────────────────────────── */}
      <div className="hidden md:block overflow-x-auto pb-6">
        <div className="mx-auto" style={{ width: totalW }}>

        {/* Round labels */}
        <div className="flex mb-2">
          {labelCols.map((col, i) => (
            <div
              key={i}
              style={{ width: col.w, flexShrink: 0 }}
              className="text-center text-[10px] text-amber-400/60 font-semibold uppercase tracking-wider truncate"
            >
              {col.label}
            </div>
          ))}
        </div>

        {/* Bracket tree — all columns share the same height via items-stretch */}
        <div className="flex items-stretch" style={{ height: 680 }}>

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
      </div>

      {/* ── Mobile: round-by-round cards ─────────────────────────────── */}
      <div className="md:hidden flex flex-col gap-4">
        {[
          { label: "Round of 32",   matches: [...r32L, ...r32R].filter(Boolean) },
          { label: "Round of 16",   matches: [...r16L, ...r16R].filter(Boolean) },
          { label: "Quarterfinals", matches: [...qfL,  ...qfR ].filter(Boolean) },
          { label: "Semifinals",    matches: [sfL, sfR].filter(Boolean) },
          { label: "Final",         matches: finalMatch ? [finalMatch] : [] },
          { label: "Third Place",   matches: third      ? [third]      : [] },
        ].filter(({ matches }) => matches.length > 0).map(({ label, matches }) => (
          <div key={label} className="bg-gray-900/50 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
            <div className="px-4 py-2 border-b border-white/5">
              <span className="text-xs font-bold uppercase tracking-widest text-amber-400">{label}</span>
            </div>
            <div className="divide-y divide-white/5">
              {(matches as (MatchWithTeams | undefined)[]).map((m, i) => {
                if (!m) return null;
                const hasScore = m.home_score !== null;
                const isLive   = m.status === "live";
                const homeSrc  = (m.home_team ? getFlagUrl(m.home_team.name) : null) ?? m.home_team?.flag_url ?? null;
                const awaySrc  = (m.away_team ? getFlagUrl(m.away_team.name) : null) ?? m.away_team?.flag_url ?? null;
                return (
                  <Link key={i} href={`/matches/${m.id}`}
                    className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/5 transition-colors">
                    {/* Home */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0 justify-end">
                      <span className="text-white text-xs truncate">{m.home_team?.name ?? "TBD"}</span>
                      {homeSrc
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={homeSrc} alt="" className="w-6 h-4 object-cover rounded-sm border border-gray-700 shrink-0" />
                        : <span className="w-6 h-4 bg-gray-700 rounded-sm shrink-0 inline-block" />}
                    </div>
                    {/* Score / vs */}
                    <div className="text-center shrink-0 w-12">
                      {hasScore ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`font-mono font-bold text-sm ${isLive ? "text-emerald-400" : "text-white"}`}>
                            {m.home_score}–{m.away_score}
                          </span>
                          {m.score_duration === "PENALTY_SHOOTOUT" && (
                            <span className="text-[9px] text-amber-400 font-semibold leading-none">
                              pens {m.penalties_home}–{m.penalties_away}
                            </span>
                          )}
                          {m.score_duration === "EXTRA_TIME" && (
                            <span className="text-[9px] text-amber-400 font-semibold leading-none">
                              {m.home_score_et !== null && m.away_score_et !== null
                                ? `${m.home_score_et}–${m.away_score_et} AET`
                                : "AET"}
                            </span>
                          )}
                        </div>
                      ) : isLive ? (
                        <span className="text-[9px] bg-red-600 text-white px-1 py-0.5 rounded-full animate-pulse">LIVE</span>
                      ) : (
                        <span className="text-gray-600 text-xs">vs</span>
                      )}
                    </div>
                    {/* Away */}
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      {awaySrc
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={awaySrc} alt="" className="w-6 h-4 object-cover rounded-sm border border-gray-700 shrink-0" />
                        : <span className="w-6 h-4 bg-gray-700 rounded-sm shrink-0 inline-block" />}
                      <span className="text-white text-xs truncate">{m.away_team?.name ?? "TBD"}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
