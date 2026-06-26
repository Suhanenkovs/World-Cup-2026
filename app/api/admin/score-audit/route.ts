import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { calculateMatchPoints, type Stage } from "@/lib";

export async function GET(request: NextRequest) {
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

  const [
    { data: matches, error: matchErr },
    { data: profiles },
    { data: { users } },
  ] = await Promise.all([
    service.from("matches")
      .select("id, stage, home_score, away_score, home_team:home_team_id(short_name), away_team:away_team_id(short_name)")
      .eq("status", "finished")
      .not("home_score", "is", null)
      .not("away_score", "is", null)
      .limit(500),
    service.from("profiles").select("id, username, name"),
    service.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (matchErr) return Response.json({ error: matchErr.message }, { status: 500 });
  if (!matches?.length) return Response.json({ total: 0, discrepancies: [] });

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const emailMap = new Map((users ?? []).map((u) => [u.id, u.email ?? ""]));

  const discrepancies: object[] = [];

  // Query predictions per match to avoid global row limit
  for (const match of matches) {
    const { data: preds, error: predErr } = await service
      .from("predictions")
      .select("id, user_id, pred_home, pred_away, points_earned")
      .eq("match_id", match.id)
      .limit(500);

    if (predErr || !preds?.length) continue;

    for (const pred of preds) {
      const correct = calculateMatchPoints(
        pred.pred_home,
        pred.pred_away,
        match.home_score!,
        match.away_score!,
        match.stage as Stage
      );

      if (pred.points_earned !== correct) {
        const p = profileMap.get(pred.user_id);
        const home = (match.home_team as any)?.short_name ?? "?";
        const away = (match.away_team as any)?.short_name ?? "?";
        discrepancies.push({
          player: p?.name || p?.username || emailMap.get(pred.user_id) || pred.user_id,
          match: `${home} ${match.home_score}–${match.away_score} ${away}`,
          pick: `${pred.pred_home}–${pred.pred_away}`,
          stored_pts: pred.points_earned,
          correct_pts: correct,
          diff: correct - (pred.points_earned ?? 0),
        });
      }
    }
  }

  discrepancies.sort((a: any, b: any) =>
    Math.abs(b.diff) - Math.abs(a.diff) || a.player.localeCompare(b.player)
  );

  return Response.json({ total: discrepancies.length, discrepancies });
}
