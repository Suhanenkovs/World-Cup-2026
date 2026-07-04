import type { SupabaseClient } from "@supabase/supabase-js";

type BracketSlot = {
  nextNumber?: number;
  nextStage?: "final" | "third_place";
  slot: "home_team_id" | "away_team_id";
  loser?: true;
};

const BRACKET: Record<number, BracketSlot[]> = {
  // Round of 32 → Round of 16 (verified against ESPN bracket)
  // M89: Paraguay(74) vs France(77)    M90: Canada(73) vs Morocco(75)
  // M91: Portugal(83) vs Spain(84)     M92: USA(81) vs Belgium(82)
  // M93: Brazil(76) vs Norway(78)      M94: Mexico(79) vs England(80)
  // M95: Argentina(86) vs Egypt(88)    M96: Switzerland(85) vs Colombia(87)
  73: [{ nextNumber: 90, slot: "home_team_id" }],
  74: [{ nextNumber: 89, slot: "home_team_id" }],
  75: [{ nextNumber: 90, slot: "away_team_id" }],
  76: [{ nextNumber: 93, slot: "home_team_id" }],
  77: [{ nextNumber: 89, slot: "away_team_id" }],
  78: [{ nextNumber: 93, slot: "away_team_id" }],
  79: [{ nextNumber: 94, slot: "home_team_id" }],
  80: [{ nextNumber: 94, slot: "away_team_id" }],
  81: [{ nextNumber: 92, slot: "home_team_id" }],
  82: [{ nextNumber: 92, slot: "away_team_id" }],
  83: [{ nextNumber: 91, slot: "home_team_id" }],
  84: [{ nextNumber: 91, slot: "away_team_id" }],
  85: [{ nextNumber: 96, slot: "home_team_id" }],
  86: [{ nextNumber: 95, slot: "home_team_id" }],
  87: [{ nextNumber: 96, slot: "away_team_id" }],
  88: [{ nextNumber: 95, slot: "away_team_id" }],
  // Round of 16 → Quarterfinals (verified against ESPN bracket)
  // QF M97: W89 vs W90 → SF M101   QF M98: W93 vs W94 → SF M101
  // QF M99: W91 vs W92 → SF M102   QF M100: W95 vs W96 → SF M102
  89: [{ nextNumber: 97,  slot: "home_team_id" }],
  90: [{ nextNumber: 97,  slot: "away_team_id" }],
  91: [{ nextNumber: 99,  slot: "home_team_id" }],
  92: [{ nextNumber: 99,  slot: "away_team_id" }],
  93: [{ nextNumber: 98,  slot: "home_team_id" }],
  94: [{ nextNumber: 98,  slot: "away_team_id" }],
  95: [{ nextNumber: 100, slot: "home_team_id" }],
  96: [{ nextNumber: 100, slot: "away_team_id" }],
  // Quarterfinals → Semifinals
  97:  [{ nextNumber: 101, slot: "home_team_id" }],
  98:  [{ nextNumber: 101, slot: "away_team_id" }],
  99:  [{ nextNumber: 102, slot: "home_team_id" }],
  100: [{ nextNumber: 102, slot: "away_team_id" }],
  // Semifinals → Final (winner) + 3rd place (loser)
  101: [
    { nextStage: "final",       slot: "home_team_id" },
    { nextStage: "third_place", slot: "home_team_id", loser: true },
  ],
  102: [
    { nextStage: "final",       slot: "away_team_id" },
    { nextStage: "third_place", slot: "away_team_id", loser: true },
  ],
};

// Promotes winners (and SF losers) into the next knockout slot.
// Safe to call multiple times — already-filled slots are skipped unless force=true.
// Returns the number of slots written.
export async function promoteBracket(supabase: SupabaseClient, force = false): Promise<number> {
  const { data: finishedKnockouts } = await supabase
    .from("matches")
    .select("match_number, home_team_id, away_team_id, home_score, away_score, home_score_et, away_score_et, penalties_home, penalties_away")
    .in("stage", ["round_of_32", "round_of_16", "quarterfinal", "semifinal"])
    .eq("status", "finished")
    .not("home_team_id", "is", null)
    .not("away_team_id", "is", null)
    .not("match_number", "is", null);

  const { data: knockoutTargets } = await supabase
    .from("matches")
    .select("id, match_number, stage, home_team_id, away_team_id")
    .in("stage", ["round_of_16", "quarterfinal", "semifinal", "final", "third_place"]);

  const targetByNumber = new Map(
    (knockoutTargets ?? []).filter((m) => m.match_number).map((m) => [m.match_number as number, m])
  );
  const targetByStage = new Map(
    (knockoutTargets ?? []).filter((m) => !m.match_number).map((m) => [m.stage as string, m])
  );

  let promoted = 0;

  for (const fin of finishedKnockouts ?? []) {
    const num = fin.match_number as number;
    const progression = BRACKET[num];
    if (!progression) continue;

    let winnerId: string;
    let loserId: string;

    if (fin.penalties_home !== null && fin.penalties_away !== null && fin.penalties_home !== fin.penalties_away) {
      const homeWins = (fin.penalties_home as number) > (fin.penalties_away as number);
      winnerId = homeWins ? fin.home_team_id : fin.away_team_id;
      loserId  = homeWins ? fin.away_team_id : fin.home_team_id;
    } else if (fin.home_score_et !== null && fin.away_score_et !== null) {
      if (fin.home_score_et === fin.away_score_et) continue;
      const homeWins = (fin.home_score_et as number) > (fin.away_score_et as number);
      winnerId = homeWins ? fin.home_team_id : fin.away_team_id;
      loserId  = homeWins ? fin.away_team_id : fin.home_team_id;
    } else {
      if (fin.home_score === null || fin.away_score === null || fin.home_score === fin.away_score) continue;
      const homeWins = (fin.home_score as number) > (fin.away_score as number);
      winnerId = homeWins ? fin.home_team_id : fin.away_team_id;
      loserId  = homeWins ? fin.away_team_id : fin.home_team_id;
    }

    for (const p of progression) {
      const target = p.nextNumber
        ? targetByNumber.get(p.nextNumber)
        : targetByStage.get(p.nextStage!);
      if (!target) continue;
      if (!force && target[p.slot as keyof typeof target]) continue;

      const teamId = p.loser ? loserId : winnerId;
      const { error } = await supabase
        .from("matches")
        .update({ [p.slot]: teamId })
        .eq("id", target.id);
      if (!error) promoted++;
    }
  }

  return promoted;
}
