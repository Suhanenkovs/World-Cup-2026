import { POINTS_CORRECT_RESULT, POINTS_GOAL_DIFF, POINTS_EXACT_SCORE, type Stage } from "./constants";

type Outcome = "home" | "away" | "draw";

function getOutcome(home: number, away: number): Outcome {
  if (home > away) return "home";
  if (away > home) return "away";
  return "draw";
}

export function calculateMatchPoints(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number,
  stage: Stage
): number {
  // Exact score
  if (predHome === actualHome && predAway === actualAway) {
    return POINTS_EXACT_SCORE[stage];
  }
  const correctResult = getOutcome(predHome, predAway) === getOutcome(actualHome, actualAway);
  // Correct result + correct goal difference (but not exact)
  if (correctResult && predHome - predAway === actualHome - actualAway) {
    return POINTS_GOAL_DIFF[stage];
  }
  // Correct result only
  if (correctResult) {
    return POINTS_CORRECT_RESULT[stage];
  }
  return 0;
}

export function getPrizeAmounts(
  participantCount: number,
  entryFee: number,
  winnerPct: number,
  secondPct: number,
  thirdPct: number,
  adminCost: number = 0
) {
  const pot = participantCount * entryFee;
  const prizePool = Math.max(0, pot - adminCost);
  return {
    pot,
    adminCost,
    prizePool,
    first:  Math.round((prizePool * winnerPct)  / 100),
    second: Math.round((prizePool * secondPct)  / 100),
    third:  Math.round((prizePool * thirdPct)   / 100),
  };
}
