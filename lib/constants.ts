export type Stage =
  | "group"
  | "round_of_32"
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "third_place"
  | "final";

export const STAGE_LABELS: Record<Stage, string> = {
  group: "Group Stage",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarterfinal: "Quarterfinal",
  semifinal: "Semifinal",
  third_place: "3rd Place",
  final: "Final",
};

export const STAGE_ORDER: Stage[] = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarterfinal",
  "semifinal",
  "third_place",
  "final",
];

export const POINTS_CORRECT_RESULT: Record<Stage, number> = {
  group:       2,
  round_of_32: 3,
  round_of_16: 3,
  quarterfinal: 5,
  semifinal:   5,
  third_place: 6,
  final:       6,
};

export const POINTS_GOAL_DIFF: Record<Stage, number> = {
  group:       3,
  round_of_32: 5,
  round_of_16: 5,
  quarterfinal: 7,
  semifinal:   7,
  third_place: 8,
  final:       8,
};

export const POINTS_EXACT_SCORE: Record<Stage, number> = {
  group:       5,
  round_of_32: 7,
  round_of_16: 7,
  quarterfinal: 10,
  semifinal:   10,
  third_place: 12,
  final:       12,
};

// Tournament dates
export const TOURNAMENT_START = new Date("2026-06-11T19:00:00Z"); // first kickoff
export const TOURNAMENT_END = new Date("2026-07-19T18:00:00-04:00");

// Bonus questions lock at first kickoff
export const BONUS_LOCK_AT = TOURNAMENT_START;
