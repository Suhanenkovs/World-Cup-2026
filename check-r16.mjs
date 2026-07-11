import { createClient } from "@supabase/supabase-js";
const { config } = await import("dotenv");
config({ path: ".env.local" });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: r16 } = await supabase
  .from("matches")
  .select("id, match_number, stage, home_team_id, away_team_id, home_team:home_team_id(name), away_team:away_team_id(name)")
  .in("stage", ["round_of_16"])
  .order("match_number");

console.log("=== R16 MATCHES ===");
for (const m of r16 ?? []) {
  console.log(`M${m.match_number}: ${m.home_team?.name ?? "(null)"} [${m.home_team_id ?? "null"}] vs ${m.away_team?.name ?? "(null)"} [${m.away_team_id ?? "null"}]`);
}
