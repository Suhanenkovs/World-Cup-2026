import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calculateMatchPoints, type Stage } from "@/lib";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const service = createServiceClient();

  const { data: matches, error: matchErr } = await service
    .from("matches")
    .select("id, stage, home_score, away_score")
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .limit(500);

  if (matchErr) return Response.json({ error: matchErr.message }, { status: 500 });
  if (!matches?.length) return Response.json({ success: true, rescored: 0, matches: 0, errors: [] });

  let rescored = 0;
  const errors: string[] = [];

  // Sequential per match to avoid connection pool saturation
  for (const match of matches) {
    const { data: preds, error: predErr } = await service
      .from("predictions")
      .select("id, pred_home, pred_away")
      .eq("match_id", match.id)
      .limit(500);

    if (predErr) { errors.push(`Match ${match.id}: ${predErr.message}`); continue; }
    if (!preds?.length) continue;

    for (const pred of preds) {
      const pts = calculateMatchPoints(
        pred.pred_home,
        pred.pred_away,
        match.home_score!,
        match.away_score!,
        match.stage as Stage
      );
      const { error: updErr } = await service
        .from("predictions")
        .update({ points_earned: pts })
        .eq("id", pred.id);

      if (updErr) {
        errors.push(`Pred ${pred.id}: ${updErr.message}`);
      } else {
        rescored++;
      }
    }
  }

  return Response.json({ success: errors.length === 0, rescored, matches: matches.length, errors });
}
