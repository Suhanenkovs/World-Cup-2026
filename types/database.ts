export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

// ── Row types ──────────────────────────────────────────────────────────────

export interface TeamRow {
  id: string;
  api_id: string | null;
  name: string;
  short_name: string;
  flag_url: string | null;
  group_letter: string | null;
  created_at: string;
}

export interface MatchRow {
  id: string;
  api_id: string | null;
  match_number: number | null;
  stage: string;
  group_letter: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_score: number | null;   // regulation time (90 min) — used for prediction scoring
  away_score: number | null;
  home_score_et: number | null;  // cumulative score after extra time
  away_score_et: number | null;
  penalties_home: number | null; // penalty shootout goals only
  penalties_away: number | null;
  score_duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT" | null;
  scheduled_at: string;
  venue: string | null;
  status: "scheduled" | "live" | "finished";
  created_at: string;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  username: string;
  is_admin: boolean;
  paid: boolean;
  invited_at: string | null;
  joined_at: string;
}

export interface PredictionRow {
  id: string;
  user_id: string;
  match_id: string;
  pred_home: number;
  pred_away: number;
  points_earned: number | null;
  submitted_at: string;
  updated_at: string;
}

export interface BonusQuestionRow {
  id: string;
  question: string;
  category: string;
  max_points: number;
  correct_answer: string | null;
  resolved_at: string | null;
  created_at: string;
  answer_type: "text" | "number" | "team" | "player" | "yesno" | "select";
  options: string[] | null;
  sort_order: number;
}

export interface BonusAnswerRow {
  id: string;
  user_id: string;
  question_id: string;
  answer: string;
  points_earned: number | null;
  submitted_at: string;
}

export interface PrizeConfigRow {
  id: number;
  entry_fee: number;
  winner_pct: number;
  second_pct: number;
  third_pct: number;
  admin_pct: number;
}

export interface LeaderboardRow {
  id: string;
  username: string;
  paid: boolean;
  total_points: number;
  match_points: number;
  bonus_points: number;
  correct_predictions: number;
}

// ── Supabase Database shape ────────────────────────────────────────────────

export type Database = {
  public: {
    Tables: {
      teams: {
        Row: TeamRow;
        Insert: Omit<TeamRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<TeamRow, "id">>;
        Relationships: [];
      };
      matches: {
        Row: MatchRow;
        Insert: Omit<MatchRow, "id" | "created_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<MatchRow, "id">>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, "joined_at"> & { joined_at?: string };
        Update: Partial<Omit<ProfileRow, "id">>;
        Relationships: [];
      };
      predictions: {
        Row: PredictionRow;
        Insert: Omit<PredictionRow, "id" | "submitted_at" | "updated_at"> & { id?: string };
        Update: Partial<Omit<PredictionRow, "id">>;
        Relationships: [];
      };
      bonus_questions: {
        Row: BonusQuestionRow;
        Insert: Omit<BonusQuestionRow, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<BonusQuestionRow, "id">>;
        Relationships: [];
      };
      bonus_answers: {
        Row: BonusAnswerRow;
        Insert: Omit<BonusAnswerRow, "id" | "submitted_at"> & { id?: string };
        Update: Partial<Omit<BonusAnswerRow, "id">>;
        Relationships: [];
      };
      prize_config: {
        Row: PrizeConfigRow;
        Insert: Partial<PrizeConfigRow>;
        Update: Partial<PrizeConfigRow>;
        Relationships: [];
      };
    };
    Views: {
      leaderboard: {
        Row: LeaderboardRow;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

// ── Convenience aliases ────────────────────────────────────────────────────

export type Team = TeamRow;
export type Match = MatchRow;
export type Profile = ProfileRow;
export type Prediction = PredictionRow;
export type BonusQuestion = BonusQuestionRow;
export type BonusAnswer = BonusAnswerRow;

export type MatchWithTeams = MatchRow & {
  home_team: Team | null;
  away_team: Team | null;
};

export type PredictionWithMatch = PredictionRow & {
  match: MatchWithTeams;
};
