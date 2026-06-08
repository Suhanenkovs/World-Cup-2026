import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import type { MatchWithTeams, Team } from "@/types/database";
import { getFlagUrl } from "@/lib/teamFlags";

export const revalidate = 60;

function Flag({ team }: { team: Team | null | undefined }) {
  if (!team) return null;
  const src = team.flag_url ?? getFlagUrl(team.name);
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={team.name} className="w-5 h-3.5 object-cover rounded-sm border border-gray-700 shrink-0" />;
}

function TeamRow({ team, score }: { team: Team | null | undefined; score: number | null }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Flag team={team} />
      <span className={`text-xs font-medium truncate ${team ? "text-white" : "text-gray-500"}`}>
        {team?.short_name ?? team?.name ?? "TBD"}
      </span>
      {score !== null && (
        <span className="ml-auto text-xs font-bold text-white shrink-0 pl-2">{score}</span>
      )}
    </div>
  );
}

function MatchSlot({ match, label }: { match: MatchWithTeams | undefined; label?: string }) {
  const hasScore = match && match.home_score !== null;
  return (
    <div className={`rounded-lg border text-[11px] w-36 shrink-0 overflow-hidden
      ${match ? "bg-gray-900 border-gray-700" : "bg-gray-900/40 border-gray-800"}`}>
      {label && (
        <div className="bg-gray-800 px-2 py-0.5 text-[10px] text-gray-400 font-medium">{label}</div>
      )}
      {match ? (
        <div className="px-2 py-1.5 flex flex-col gap-1">
          <TeamRow team={match.home_team} score={hasScore ? match.home_score : null} />
          <TeamRow team={match.away_team} score={hasScore ? match.away_score : null} />
        </div>
      ) : (
        <div className="px-2 py-1.5 flex flex-col gap-1">
          <div className="text-gray-600 text-[10px]">TBD</div>
          <div className="text-gray-600 text-[10px]">TBD</div>
        </div>
      )}
    </div>
  );
}

// Bracket arm: vertical line + horizontal connector
function Arm({ position }: { position: "top" | "bottom" }) {
  return (
    <div className="flex flex-col items-end w-4 shrink-0">
      <div className={`border-gray-600 border-r-2 border-t-2 rounded-tr-sm w-full
        ${position === "top" ? "h-1/2 self-end border-b-0" : "hidden"}`} />
      <div className={`border-gray-600 border-r-2 border-b-2 rounded-br-sm w-full
        ${position === "bottom" ? "h-1/2 self-start border-t-0" : "hidden"}`} />
    </div>
  );
}

// A pair of QF matches that feed into one SF match
function QFPair({ top, bottom, sf }: {
  top: MatchWithTeams | undefined;
  bottom: MatchWithTeams | undefined;
  sf: MatchWithTeams | undefined;
}) {
  return (
    <div className="flex items-center gap-0">
      {/* QF column */}
      <div className="flex flex-col gap-6">
        <MatchSlot match={top} />
        <MatchSlot match={bottom} />
      </div>

      {/* bracket arm */}
      <div className="flex flex-col self-stretch w-4 shrink-0">
        <div className="flex-1 border-r-2 border-b-2 border-gray-600 rounded-br-sm" />
        <div className="flex-1 border-r-2 border-t-2 border-gray-600 rounded-tr-sm" />
      </div>

      {/* SF match */}
      <MatchSlot match={sf} />
    </div>
  );
}

export default async function BracketPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: matches } = await supabase
    .from("matches")
    .select("*, home_team:home_team_id(*), away_team:away_team_id(*)")
    .in("stage", ["quarterfinal", "semifinal", "final", "third_place"])
    .order("match_number", { ascending: true });

  const all = (matches ?? []) as MatchWithTeams[];
  const qf = all.filter((m) => m.stage === "quarterfinal");
  const sf = all.filter((m) => m.stage === "semifinal");
  const final = all.find((m) => m.stage === "final");
  const third = all.find((m) => m.stage === "third_place");

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-white mb-1">Knockout Bracket</h1>
      <p className="text-gray-400 text-sm mb-8">Quarterfinals onwards — earlier rounds in the match schedule</p>

      {/* Desktop bracket */}
      <div className="hidden md:flex items-center justify-center gap-0">

        {/* Left: QF1+QF2 → SF1 */}
        <QFPair top={qf[0]} bottom={qf[1]} sf={sf[0]} />

        {/* Left SF → Final arm */}
        <div className="flex flex-col self-stretch w-4 shrink-0">
          <div className="flex-1 border-r-2 border-b-2 border-gray-600 rounded-br-sm" />
          <div className="flex-1 border-r-2 border-t-2 border-gray-600 rounded-tr-sm" />
        </div>

        {/* Center: Final + trophy + 3rd place */}
        <div className="flex flex-col items-center gap-4 px-2">
          <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Final</div>
          <MatchSlot match={final} />
          <div className="flex flex-col items-center">
            <img src="/world-cup-trophy.png" alt="Trophy" className="w-14 h-14 object-contain opacity-90" />
            <span className="text-amber-400 text-[10px] font-semibold mt-1">WORLD CUP</span>
          </div>
          <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">3rd Place</div>
          <MatchSlot match={third} />
        </div>

        {/* Right SF → Final arm */}
        <div className="flex flex-col self-stretch w-4 shrink-0">
          <div className="flex-1 border-l-2 border-b-2 border-gray-600 rounded-bl-sm" />
          <div className="flex-1 border-l-2 border-t-2 border-gray-600 rounded-tl-sm" />
        </div>

        {/* Right: QF3+QF4 → SF2 (mirrored) */}
        <div className="flex items-center gap-0">
          <MatchSlot match={sf[1]} />

          <div className="flex flex-col self-stretch w-4 shrink-0">
            <div className="flex-1 border-l-2 border-b-2 border-gray-600 rounded-bl-sm" />
            <div className="flex-1 border-l-2 border-t-2 border-gray-600 rounded-tl-sm" />
          </div>

          <div className="flex flex-col gap-6">
            <MatchSlot match={qf[2]} />
            <MatchSlot match={qf[3]} />
          </div>
        </div>
      </div>

      {/* Mobile: vertical list by round */}
      <div className="md:hidden space-y-6">
        {[
          { label: "Quarterfinals", matches: qf },
          { label: "Semifinals", matches: sf },
          { label: "Final", matches: final ? [final] : [] },
          { label: "3rd Place Play-off", matches: third ? [third] : [] },
        ].map(({ label, matches: round }) => (
          <div key={label}>
            <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">{label}</h2>
            <div className="flex flex-col gap-2">
              {(round as MatchWithTeams[]).map((m) => (
                <MatchSlot key={m.id} match={m} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex justify-center pt-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/world-cup-trophy.png" alt="Trophy" className="w-16 h-16 object-contain opacity-80" />
        </div>
      </div>
    </div>
  );
}
