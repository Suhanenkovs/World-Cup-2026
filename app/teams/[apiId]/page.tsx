import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { getFlagUrl } from "@/lib/teamFlags";
import Link from "next/link";

export const revalidate = 3600;

// ── football-data.org types ────────────────────────────────────────────────

interface FDPlayer {
  id: number;
  name: string;
  position: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
}

interface FDTeamDetail {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string | null;
  type: string | null;
  venue: string | null;
  coach: { name: string | null; nationality: string | null } | null;
  squad: FDPlayer[];
}

async function fetchTeamDetail(apiId: string): Promise<FDTeamDetail | null> {
  try {
    const res = await fetch(`https://api.football-data.org/v4/teams/${apiId}`, {
      headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY! },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    return await res.json() as FDTeamDetail;
  } catch {
    return null;
  }
}

function calcAge(dateOfBirth: string | null): string {
  if (!dateOfBirth) return "–";
  const birth = new Date(dateOfBirth);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return String(age);
}

const POSITION_ORDER = ["Goalkeeper", "Defence", "Midfield", "Offence"] as const;
const POSITION_LABELS: Record<string, string> = {
  Goalkeeper: "Goalkeepers",
  Defence:    "Defenders",
  Midfield:   "Midfielders",
  Offence:    "Forwards",
};

// ── Page ───────────────────────────────────────────────────────────────────

export default async function TeamPage({
  params,
}: {
  params: Promise<{ apiId: string }>;
}) {
  const { apiId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Our DB team record (for flag_url, group info, etc.)
  const { data: dbTeam } = await supabase
    .from("teams")
    .select("*")
    .eq("api_id", apiId)
    .maybeSingle();

  // Football-data.org squad + info
  const detail = await fetchTeamDetail(apiId);

  if (!detail && !dbTeam) notFound();

  // Guard: if fd.org returned a club instead of a national team, ignore the API data
  const isNational = !detail?.type || detail.type === "NATIONAL";
  const safeDetail = isNational ? detail : null;

  const teamName = safeDetail?.name ?? dbTeam?.name ?? "Team";
  const flagSrc  = dbTeam?.flag_url ?? getFlagUrl(teamName);

  // Group squad by position
  const squad = safeDetail?.squad ?? [];
  const grouped = POSITION_ORDER
    .map((pos) => ({ pos, label: POSITION_LABELS[pos], players: squad.filter((p) => p.position === pos) }))
    .filter((g) => g.players.length > 0);
  const others = squad.filter((p) => !POSITION_ORDER.includes(p.position as typeof POSITION_ORDER[number]));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">

      {/* Back */}
      <Link href="/groups" className="text-xs text-gray-500 hover:text-gray-300 transition-colors mb-6 inline-block">
        ← Groups
      </Link>

      {/* Team header */}
      <div className="flex items-center gap-5 mb-8">
        {flagSrc
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={flagSrc} alt={teamName} className="w-20 h-14 object-cover rounded-xl border border-white/10 shadow-lg shrink-0" />
          : <span className="w-20 h-14 rounded-xl bg-gray-800 shrink-0 inline-block" />
        }
        <div>
          <h1 className="text-3xl font-bold text-white">{teamName}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
            {safeDetail?.tla && <span className="font-mono text-gray-500">{safeDetail.tla}</span>}
            {dbTeam?.group_letter && <span>Group {dbTeam.group_letter}</span>}
            {safeDetail?.venue && <span className="hidden sm:inline">{safeDetail.venue}</span>}
          </div>
        </div>
      </div>

      {/* Coach */}
      {safeDetail?.coach?.name && (
        <div className="bg-gray-900/75 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3 mb-6 flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Head Coach</span>
          <span className="text-white font-semibold">{safeDetail.coach.name}</span>
          {safeDetail.coach.nationality && (
            <span className="text-gray-400 text-sm">{safeDetail.coach.nationality}</span>
          )}
        </div>
      )}

      {/* Squad */}
      {grouped.length > 0 ? (
        <div className="flex flex-col gap-5">
          {[...grouped, ...(others.length ? [{ pos: "Other", label: "Other", players: others }] : [])].map(({ pos, label, players }) => (
            <div key={pos}>
              <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">{label}</h2>
              <div className="bg-gray-900/75 backdrop-blur-sm border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {players.map((p, i) => (
                      <tr key={p.id} className={`border-b border-white/5 last:border-0 ${i % 2 !== 0 ? "bg-white/[0.02]" : ""}`}>
                        <td className="px-4 py-2.5 text-white font-medium">{p.name}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-right hidden sm:table-cell">{p.nationality ?? "–"}</td>
                        <td className="px-4 py-2.5 text-gray-500 text-right w-10 tabular-nums">{calcAge(p.dateOfBirth)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">{safeDetail ? "Squad not yet announced." : "Squad not available."}</p>
      )}

    </div>
  );
}
