import { NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { entry_fee, places } = body as {
    entry_fee: number;
    places: { pct: number }[];
  };

  if (!Array.isArray(places) || places.length < 1 || places.length > 5) {
    return Response.json({ error: "places must be an array of 1–5 items" }, { status: 400 });
  }

  const total = places.reduce((s, p) => s + p.pct, 0);
  if (Math.round(total) !== 100) {
    return Response.json({ error: `Percentages must sum to 100 (got ${total})` }, { status: 400 });
  }

  const service = createServiceClient();

  // Store up to 5 prize places; unused slots default to 0
  const pcts = Array.from({ length: 5 }, (_, i) => places[i]?.pct ?? 0);

  const { error } = await service
    .from("prize_config")
    .update({
      entry_fee,
      winner_pct: pcts[0],
      second_pct: pcts[1],
      third_pct:  pcts[2],
      fourth_pct: pcts[3],
      fifth_pct:  pcts[4],
    })
    .eq("id", 1);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ success: true });
}
