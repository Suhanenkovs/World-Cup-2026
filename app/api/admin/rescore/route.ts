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

  const { data: matches } = await service
    .from("matches")
    .select("id, stage, home_score, away_score")
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  if (!matches?.length) return Response.json({ rescored: 0, matches: 0 });

  let rescored = 0;

  await Promise.all(
    matches.map(async (match) => {
      const { data: preds } = await service
        .from("predictions")
        .select("id, pred_home, pred_away")
        .eq("match_id", match.id);

      if (!preds?.length) return;

      await Promise.all(
        preds.map((pred) => {
          const pts = calculateMatchPoints(
            pred.pred_home, pred.pred_away,
            match.home_score!, match.away_score!,
            match.stage as Stage
          );
          rescored++;
          return service.from("predictions").update({ points_earned: pts }).eq("id", pred.id);
        })
      );
    })
  );

  return Response.json({ success: true, rescored, matches: matches.length });
}
