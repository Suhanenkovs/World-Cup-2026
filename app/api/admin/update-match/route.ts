import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calculateMatchPoints, type Stage } from "@/lib";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { matchId, status, homeScore, awayScore, homeScoreEt, awayScoreEt, penHome, penAway, scoreDuration } = body;

  if (!matchId) return Response.json({ error: "matchId required" }, { status: 400 });

  const service = createServiceClient();

  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (homeScore !== undefined) update.home_score = homeScore === "" ? null : Number(homeScore);
  if (awayScore !== undefined) update.away_score = awayScore === "" ? null : Number(awayScore);
  if (homeScoreEt !== undefined) update.home_score_et = homeScoreEt === "" ? null : Number(homeScoreEt);
  if (awayScoreEt !== undefined) update.away_score_et = awayScoreEt === "" ? null : Number(awayScoreEt);
  if (penHome !== undefined) update.penalties_home = penHome === "" ? null : Number(penHome);
  if (penAway !== undefined) update.penalties_away = penAway === "" ? null : Number(penAway);
  if (scoreDuration !== undefined) update.score_duration = scoreDuration || null;

  const { error } = await service.from("matches").update(update).eq("id", matchId);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // (Re-)score all predictions when marked finished with a valid regulation score.
  // We always overwrite points_earned so a score correction propagates to the leaderboard.
  const hScore = update.home_score as number | null | undefined;
  const aScore = update.away_score as number | null | undefined;
  if (status === "finished" && typeof hScore === "number" && typeof aScore === "number") {
    const { data: match } = await service.from("matches").select("stage").eq("id", matchId).single();
    const { data: preds } = await service
      .from("predictions")
      .select("id, pred_home, pred_away")
      .eq("match_id", matchId);

    for (const pred of preds ?? []) {
      const pts = calculateMatchPoints(pred.pred_home, pred.pred_away, hScore, aScore, match?.stage as Stage);
      await service.from("predictions").update({ points_earned: pts }).eq("id", pred.id);
    }
  }

  return Response.json({ ok: true });
}
