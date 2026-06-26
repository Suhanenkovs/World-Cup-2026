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

  const [{ data: matches }, { data: predictions }, { data: profiles }, { data: { users } }] = await Promise.all([
    service.from("matches")
      .select("id, stage, group_letter, scheduled_at, home_score, away_score, home_team:home_team_id(name, short_name), away_team:away_team_id(name, short_name)")
      .eq("status", "finished")
      .not("home_score", "is", null)
      .not("away_score", "is", null),
    service.from("predictions")
      .select("id, user_id, match_id, pred_home, pred_away, points_earned"),
    service.from("profiles")
      .select("id, username, name"),
    service.auth.admin.listUsers({ perPage: 1000 }),
  ]);

  if (!matches || !predictions) return Response.json({ discrepancies: [] });

  const matchMap = new Map(matches.map((m) => [m.id, m]));
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const emailMap = new Map((users ?? []).map((u) => [u.id, u.email ?? ""]));

  const discrepancies: object[] = [];

  for (const pred of predictions ?? []) {
    const match = matchMap.get(pred.match_id);
    if (!match) continue;

    const correct = calculateMatchPoints(
      pred.pred_home, pred.pred_away,
      match.home_score!, match.away_score!,
      match.stage as Stage
    );

    if (pred.points_earned !== correct) {
      const p = profileMap.get(pred.user_id);
      const home = (match.home_team as any)?.short_name ?? "?";
      const away = (match.away_team as any)?.short_name ?? "?";
      discrepancies.push({
        player: p?.name || p?.username || emailMap.get(pred.user_id) || pred.user_id,
        email: emailMap.get(pred.user_id),
        match: `${home} ${match.home_score}–${match.away_score} ${away}`,
        pick: `${pred.pred_home}–${pred.pred_away}`,
        stored_pts: pred.points_earned,
        correct_pts: correct,
        diff: correct - (pred.points_earned ?? 0),
      });
    }
  }

  discrepancies.sort((a: any, b: any) => b.diff - a.diff || a.player.localeCompare(b.player));

  return Response.json({ total: discrepancies.length, discrepancies });
}
