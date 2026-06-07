-- ============================================================
-- WC 2026 Predictions App — Supabase Schema
-- Run this in your Supabase SQL editor (Project > SQL Editor)
-- ============================================================

create extension if not exists "uuid-ossp";

-- ── Teams ─────────────────────────────────────────────────
create table public.teams (
  id           uuid primary key default uuid_generate_v4(),
  api_id       text unique,
  name         text not null,
  short_name   text not null,
  flag_url     text,
  group_letter text,  -- 'A' through 'L'
  created_at   timestamptz default now()
);

-- ── Matches ───────────────────────────────────────────────
create table public.matches (
  id           uuid primary key default uuid_generate_v4(),
  api_id       text unique,
  match_number int,
  stage        text not null,
  -- stage values: group | round_of_32 | round_of_16 | quarterfinal | semifinal | third_place | final
  group_letter text,
  home_team_id uuid references public.teams(id),
  away_team_id uuid references public.teams(id),
  home_score   int,
  away_score   int,
  scheduled_at timestamptz not null,
  venue        text,
  status       text not null default 'scheduled',
  -- status values: scheduled | live | finished
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

-- ── Profiles (extends auth.users) ─────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  is_admin    boolean default false,
  paid        boolean default false,
  invited_at  timestamptz,
  joined_at   timestamptz default now()
);

-- ── Predictions ───────────────────────────────────────────
create table public.predictions (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  match_id      uuid not null references public.matches(id) on delete cascade,
  pred_home     int not null,
  pred_away     int not null,
  points_earned int,
  submitted_at  timestamptz default now(),
  updated_at    timestamptz default now(),
  unique(user_id, match_id)
);

-- ── Bonus Questions ───────────────────────────────────────
create table public.bonus_questions (
  id             uuid primary key default uuid_generate_v4(),
  question       text not null,
  category       text not null,
  max_points     int not null,
  correct_answer text,
  resolved_at    timestamptz,
  created_at     timestamptz default now()
);

-- ── Bonus Answers ─────────────────────────────────────────
create table public.bonus_answers (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  question_id   uuid not null references public.bonus_questions(id) on delete cascade,
  answer        text not null,
  points_earned int,
  submitted_at  timestamptz default now(),
  unique(user_id, question_id)
);

-- ── Prize Config ──────────────────────────────────────────
create table public.prize_config (
  id          int primary key default 1,
  entry_fee   numeric(10,2) default 20.00,
  winner_pct  int default 55,
  second_pct  int default 25,
  third_pct   int default 15,
  admin_pct   int default 5
);
insert into public.prize_config default values;

-- ── Row Level Security ────────────────────────────────────
alter table public.teams           enable row level security;
alter table public.matches         enable row level security;
alter table public.profiles        enable row level security;
alter table public.predictions     enable row level security;
alter table public.bonus_questions enable row level security;
alter table public.bonus_answers   enable row level security;
alter table public.prize_config    enable row level security;

-- Public read for reference data
create policy "teams_read_all"           on public.teams           for select using (true);
create policy "matches_read_all"         on public.matches         for select using (true);
create policy "bonus_questions_read_all" on public.bonus_questions for select using (true);
create policy "prize_config_read_all"    on public.prize_config    for select using (true);

-- Profiles
create policy "profiles_read_all"    on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_insert_own"  on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update_own"  on public.profiles for update using (auth.uid() = id);

-- Predictions
create policy "predictions_read_all"    on public.predictions for select using (auth.role() = 'authenticated');
create policy "predictions_insert_own"  on public.predictions for insert with check (auth.uid() = user_id);
create policy "predictions_update_own"  on public.predictions for update using (auth.uid() = user_id);

-- Bonus answers
create policy "bonus_answers_read_all"   on public.bonus_answers for select using (auth.role() = 'authenticated');
create policy "bonus_answers_insert_own" on public.bonus_answers for insert with check (auth.uid() = user_id);
create policy "bonus_answers_update_own" on public.bonus_answers for update using (auth.uid() = user_id);

-- ── Auto-create profile on signup ────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Leaderboard view ──────────────────────────────────────
create or replace view public.leaderboard as
select
  p.id,
  p.username,
  p.paid,
  coalesce(mp.match_points, 0) + coalesce(bp.bonus_points, 0) as total_points,
  coalesce(mp.match_points, 0)  as match_points,
  coalesce(bp.bonus_points, 0)  as bonus_points,
  coalesce(mp.correct_count, 0) as correct_predictions
from public.profiles p
left join (
  select
    user_id,
    sum(points_earned)                         as match_points,
    count(*) filter (where points_earned > 0)  as correct_count
  from public.predictions
  group by user_id
) mp on mp.user_id = p.id
left join (
  select user_id, sum(points_earned) as bonus_points
  from public.bonus_answers
  group by user_id
) bp on bp.user_id = p.id
order by total_points desc;

-- ── Seed bonus questions ──────────────────────────────────
insert into public.bonus_questions (question, category, max_points) values
  ('Who will win the tournament?',                                        'Tournament',  20),
  ('Who will reach the Final (either team)?',                             'Tournament',  12),
  ('Who will win the Golden Boot (top scorer)?',                          'Awards',      15),
  ('How many goals will the top scorer score? (exact number)',            'Awards',      10),
  ('What will be the total number of goals scored in the tournament?',    'Stats',       12),
  ('Which team will score the most goals in the group stage?',            'Stats',        8);
