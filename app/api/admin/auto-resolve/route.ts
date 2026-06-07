import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const FD_BASE = "https://api.football-data.org/v4";

// Stage ranking for "host nation furthest" calculation (higher = further)
const STAGE_RANK: Record<string, number> = {
  GROUP_STAGE: 1,
  LAST_32: 2, ROUND_OF_32: 2,
  LAST_16: 3, ROUND_OF_16: 3,
  QUARTER_FINALS: 4,
  SEMI_FINALS: 5,
  THIRD_PLACE: 6,
  FINAL: 7,
};

const HOST_NATIONS = ["Mexico", "United States", "Canada"];

interface FDMatch {
  stage: string;
  status: string;
  homeTeam: { name: string };
  awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
}

export async function POST(request: NextRequest) {
  // Auth check — admin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const headers = { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY! };
  const service = createServiceClient();

  // ── 3 API calls to get everything we need ──────────────────────────────────
  const [compRes, scorersRes, matchesRes] = await Promise.all([
    fetch(`${FD_BASE}/competitions/WC`, { headers }),
    fetch(`${FD_BASE}/competitions/WC/scorers?season=2026`, { headers }),
    fetch(`${FD_BASE}/competitions/WC/matches?season=2026`, { headers }),
  ]);

  if (!compRes.ok || !scorersRes.ok || !matchesRes.ok) {
    return Response.json({ error: "football-data.org fetch failed" }, { status: 502 });
  }

  const [comp, scorersJson, matchesJson] = await Promise.all([
    compRes.json(), scorersRes.json(), matchesRes.json(),
  ]);

  const allMatches: FDMatch[] = matchesJson.matches ?? [];
  const finished = allMatches.filter((m) => m.status === "FINISHED");

  // ── Derive answers ──────────────────────────────────────────────────────────

  // Tournament winner
  const winner: string | null = comp.currentSeason?.winner?.name ?? null;

  // Finalists (both teams in the Final)
  const finalMatch = allMatches.find((m) => m.stage === "FINAL");
  const finalists: string[] = finalMatch
    ? [finalMatch.homeTeam.name, finalMatch.awayTeam.name]
    : [];

  // Golden Boot — top scorer name + goals
  const topScorer = scorersJson.scorers?.[0];
  const topScorerName: string | null = topScorer?.player?.name ?? null;
  const topScorerGoals: number | null = topScorer?.goals ?? null;

  // Total goals in tournament
  const totalGoals = finished.reduce(
    (sum, m) => sum + (m.score.fullTime.home ?? 0) + (m.score.fullTime.away ?? 0), 0
  );

  // Most goals in group stage
  const groupFinished = finished.filter((m) => m.stage === "GROUP_STAGE");
  const teamGoalMap: Record<string, number> = {};
  for (const m of groupFinished) {
    teamGoalMap[m.homeTeam.name] = (teamGoalMap[m.homeTeam.name] ?? 0) + (m.score.fullTime.home ?? 0);
    teamGoalMap[m.awayTeam.name] = (teamGoalMap[m.awayTeam.name] ?? 0) + (m.score.fullTime.away ?? 0);
  }
  const mostGoalsTeam = Object.entries(teamGoalMap)
    .sort(([, a], [, b]) => b - a)[0]?.[0] ?? null;

  // Host nation that went furthest
  const teamBestRank: Record<string, number> = {};
  for (const m of finished) {
    const rank = STAGE_RANK[m.stage] ?? 0;
    for (const team of [m.homeTeam.name, m.awayTeam.name]) {
      teamBestRank[team] = Math.max(teamBestRank[team] ?? 0, rank);
    }
  }
  const hostNationFurthest = HOST_NATIONS
    .filter((h) => teamBestRank[h] !== undefined)
    .sort((a, b) => (teamBestRank[b] ?? 0) - (teamBestRank[a] ?? 0))[0] ?? null;

  // ── Map question text → resolved answer ────────────────────────────────────

  function matchAnswer(question: string): { answer: string; multi?: string[] } | null {
    const q = question.toLowerCase();
    if ((q.includes("who will win") && q.includes("tournament")) && winner)
      return { answer: winner };
    if (q.includes("reach the final") && finalists.length === 2)
      return { answer: finalists[0], multi: finalists };
    if (q.includes("golden boot") || q.includes("top scorer"))
      return topScorerName ? { answer: topScorerName } : null;
    if (q.includes("how many goals will the top scorer") && topScorerGoals !== null)
      return { answer: String(topScorerGoals) };
    if (q.includes("total number of goals") && totalGoals > 0)
      return { answer: String(totalGoals) };
    if (q.includes("score the most goals in the group") && mostGoalsTeam)
      return { answer: mostGoalsTeam };
    if (q.includes("host nation") && hostNationFurthest)
      return { answer: hostNationFurthest };
    return null; // cannot auto-resolve (e.g. red card in Final)
  }

  // ── Fetch unresolved questions and resolve them ─────────────────────────────

  const { data: questions } = await service
    .from("bonus_questions")
    .select("id, question, max_points")
    .is("resolved_at", null);

  const results: { question: string; answer: string | null; scored: number }[] = [];

  for (const q of questions ?? []) {
    const resolved = matchAnswer(q.question);
    if (!resolved) {
      results.push({ question: q.question, answer: null, scored: 0 });
      continue;
    }

    // Mark question resolved
    await service.from("bonus_questions").update({
      correct_answer: resolved.answer,
      resolved_at: new Date().toISOString(),
    }).eq("id", q.id);

    // Score all user answers
    const { data: answers } = await service
      .from("bonus_answers").select("id, answer").eq("question_id", q.id);

    let scored = 0;
    for (const a of answers ?? []) {
      const userAnswer = a.answer.trim().toLowerCase();
      // Accept any of the valid answers (handles "either finalist" case)
      const validAnswers = resolved.multi
        ? resolved.multi.map((v) => v.trim().toLowerCase())
        : [resolved.answer.trim().toLowerCase()];
      const pts = validAnswers.includes(userAnswer) ? q.max_points : 0;
      await service.from("bonus_answers").update({ points_earned: pts }).eq("id", a.id);
      scored++;
    }

    results.push({ question: q.question, answer: resolved.answer, scored });
  }

  return Response.json({ success: true, results });
}
