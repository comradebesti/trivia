-- Run once in the SQL Editor of a NEW, separate Supabase project.
create table if not exists public.games (
  id text primary key,
  host_token text not null,
  title text not null,
  active_question bigint,
  phase text not null default 'lobby' check (phase in ('lobby', 'wager', 'open', 'closed', 'reveal')),
  created_at bigint not null
);

create table if not exists public.questions (
  id bigint generated always as identity primary key,
  game_id text not null references public.games(id) on delete cascade,
  position integer not null,
  stage text not null check (stage in ('round1','halftime','round2','final','tiebreaker')),
  category text not null default '',
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  kind text not null check (kind in ('single','multiple','order','short','number')),
  correct jsonb not null,
  points integer not null default 10
);
create index if not exists questions_game_stage on public.questions(game_id, stage);

create table if not exists public.teams (
  id uuid primary key,
  game_id text not null references public.games(id) on delete cascade,
  name text not null,
  token text not null,
  bonus_points integer not null default 0,
  created_at bigint not null
);
create unique index if not exists teams_game_name on public.teams(game_id, lower(name));

create table if not exists public.final_wagers (
  game_id text not null references public.games(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  amount integer not null check (amount >= 0),
  primary key (game_id, team_id)
);

create table if not exists public.answers (
  id bigint generated always as identity primary key,
  question_id bigint not null references public.questions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  stage text not null,
  choice jsonb not null,
  wager integer,
  manual_points integer,
  created_at bigint not null,
  unique (question_id, team_id)
);
create unique index if not exists answers_team_round_wager on public.answers(team_id, stage, wager)
  where stage in ('round1', 'round2') and wager is not null;
create index if not exists answers_team on public.answers(team_id);

-- Only server routes using the service role key may access these tables.
alter table public.games enable row level security;
alter table public.questions enable row level security;
alter table public.teams enable row level security;
alter table public.answers enable row level security;
alter table public.final_wagers enable row level security;

-- Insert only while the question is still open; use the unique indexes for one answer
-- per team and each round wager exactly once. The RPC runs in one transaction.
create or replace function public.submit_trivia_answer(
  p_game_id text, p_team_token text, p_choice jsonb, p_wager integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_game public.games%rowtype;
  v_question public.questions%rowtype;
  v_team public.teams%rowtype;
  v_final integer;
  v_round_count integer;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.phase <> 'open' then raise exception 'Answers are closed.'; end if;
  select * into v_team from public.teams where game_id = p_game_id and token = p_team_token;
  if not found then raise exception 'Join a team first.'; end if;
  select * into v_question from public.questions where id = v_game.active_question and game_id = p_game_id;
  if not found then raise exception 'Question unavailable.'; end if;
  if v_question.stage in ('round1','round2') then
    select count(*) into v_round_count from public.questions where game_id = p_game_id and stage = v_question.stage;
    if p_wager is null or p_wager < 1 or p_wager > v_round_count then
      raise exception 'Choose a wager from 1 to %.', v_round_count;
    end if;
  end if;
  if v_question.stage = 'final' then
    select amount into v_final from public.final_wagers where game_id = p_game_id and team_id = v_team.id;
    if not found then raise exception 'Place your final wager first.'; end if;
    p_wager := v_final;
  end if;
  insert into public.answers (question_id, team_id, stage, choice, wager, created_at)
  values (v_question.id, v_team.id, v_question.stage, p_choice, p_wager, (extract(epoch from clock_timestamp()) * 1000)::bigint);
exception
  when unique_violation then raise exception 'Already answered, or that wager was used in this round.';
end;
$$;
revoke all on function public.submit_trivia_answer(text,text,jsonb,integer) from public, anon, authenticated;
grant execute on function public.submit_trivia_answer(text,text,jsonb,integer) to service_role;
