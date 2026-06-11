import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import type { MatchWithTeams, Team } from "@/types/database";
import { STAGE_LABELS, type Stage } from "@/lib/constants";
import { getFlagUrl } from "@/lib/teamFlags";
import { getTeamTLA } from "@/lib/teamTLA";

function StatusBadge({ status }: { status: string }) {
  if (status === "finished")
    return <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full shrink-0">FT</span>;
  return null;
}

function GroupOrStageBadge({ stage, groupLetter }: { stage: string; groupLetter: string | null }) {
  if (stage === "group" && groupLetter) {
    return (
      <span className="text-xs font-semibold text-emerald-400 bg-emerald-950/60 px-1.5 py-0.5 rounded">
        Group {groupLetter}
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded">
      {STAGE_LABELS[stage as Stage] ?? stage}
    </span>
  );
}

function FlagImg({ team, className = "w-8 h-6" }: { team: Team | null; className?: string }) {
  if (!team) return <span className={`${className} rounded bg-gray-700 shrink-0 inline-block`} />;
  const src = team.flag_url ?? getFlagUrl(team.name);
  if (!src) return <span className={`${className} rounded bg-gray-700 shrink-0 inline-block`} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={team.name} className={`${className} object-cover rounded shrink-0 border border-gray-700`} />;
}

function abbr(team: Team | null): string {
  return getTeamTLA(team?.name);
}

export default function MatchCard({ match }: { match: MatchWithTeams }) {
  const kickoff = new Date(match.scheduled_at);
  const isFinished = match.status === "finished";
  const hasScore = match.home_score !== null;

  return (
    <Link
      href={`/matches/${match.id}`}
      className="bg-gray-900/50 backdrop-blur-sm border border-white/10 hover:border-white/25 rounded-xl px-4 py-3 transition-colors flex items-center gap-3 sm:gap-4"
    >
      {/* Date / group / venue */}
      <div className="w-24 sm:w-32 shrink-0 text-xs space-y-1">
        <div className="text-gray-300 font-medium">{formatInTimeZone(kickoff, "Europe/Riga", "d MMM · HH:mm")}</div>
        <GroupOrStageBadge stage={match.stage} groupLetter={match.group_letter} />
        {match.venue && (
          <div className="text-gray-500 leading-snug hidden sm:block">{match.venue}</div>
        )}
      </div>

      {/* Teams + score */}
      <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-2 min-w-0">

        {/* Home — right-aligned, flag closest to center */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2 min-w-0">
          {/* Desktop: name then flag */}
          <span className="hidden sm:block font-semibold text-white text-sm text-right truncate min-w-0">
            {match.home_team?.name ?? "TBD"}
          </span>
          {/* Mobile: flag + 3-letter code stacked */}
          <div className="flex sm:hidden flex-col items-center gap-0.5 shrink-0">
            <FlagImg team={match.home_team} className="w-8 h-5" />
            <span className="text-[10px] font-bold text-white leading-none">{abbr(match.home_team)}</span>
          </div>
          <div className="hidden sm:block shrink-0">
            <FlagImg team={match.home_team} />
          </div>
        </div>

        {/* Score / vs */}
        <div className="text-center w-10 sm:w-20 shrink-0 flex flex-col items-center gap-0.5">
          {hasScore ? (
            <>
              <span className={`font-mono font-bold text-base sm:text-lg ${isFinished ? "text-white" : "text-emerald-400"}`}>
                {match.home_score_et ?? match.home_score}–{match.away_score_et ?? match.away_score}
              </span>
              {match.score_duration === "EXTRA_TIME" && (
                <span className="text-[9px] text-amber-400 font-semibold leading-none">AET</span>
              )}
              {match.score_duration === "PENALTY_SHOOTOUT" && (
                <>
                  <span className="text-[9px] text-amber-400 font-semibold leading-none">AET</span>
                  <span className="text-[9px] text-gray-400 leading-none">({match.penalties_home}–{match.penalties_away} pens)</span>
                </>
              )}
            </>
          ) : match.status === "live" ? (
            <span className="text-[9px] bg-red-600 text-white px-1 py-0.5 rounded-full animate-pulse">LIVE</span>
          ) : (
            <span className="text-gray-500 text-sm font-mono">vs</span>
          )}
        </div>

        {/* Away — left-aligned, flag closest to center */}
        <div className="flex items-center justify-start gap-1.5 sm:gap-2 min-w-0">
          <div className="hidden sm:block shrink-0">
            <FlagImg team={match.away_team} />
          </div>
          {/* Mobile: flag + 3-letter code stacked */}
          <div className="flex sm:hidden flex-col items-center gap-0.5 shrink-0">
            <FlagImg team={match.away_team} className="w-8 h-5" />
            <span className="text-[10px] font-bold text-white leading-none">{abbr(match.away_team)}</span>
          </div>
          {/* Desktop: name */}
          <span className="hidden sm:block font-semibold text-white text-sm text-left truncate min-w-0">
            {match.away_team?.name ?? "TBD"}
          </span>
        </div>

      </div>

      <StatusBadge status={match.status} />
    </Link>
  );
}
