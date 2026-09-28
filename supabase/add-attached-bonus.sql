-- Run in the existing trivia Supabase project's SQL Editor before deploying this update.
alter table public.questions add column if not exists bonus_prompt text not null default '';
alter table public.questions add column if not exists bonus_target numeric;
alter table public.questions add column if not exists bonus_tolerance numeric;
alter table public.answers add column if not exists bonus_choice numeric;

create or replace function public.submit_trivia_answer_with_bonus(
  p_game_id text, p_team_token text, p_choice jsonb, p_wager integer, p_bonus_choice numeric
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
  if p_bonus_choice is not null and (v_question.bonus_prompt = '' or p_bonus_choice < 0 or p_bonus_choice > 1000000000000) then
    raise exception 'That bonus answer is not available.';
  end if;
  insert into public.answers (question_id, team_id, stage, choice, bonus_choice, wager, created_at)
  values (v_question.id, v_team.id, v_question.stage, p_choice, p_bonus_choice, p_wager, (extract(epoch from clock_timestamp()) * 1000)::bigint);
exception
  when unique_violation then raise exception 'Already answered, or that wager was used in this round.';
end;
$$;
revoke all on function public.submit_trivia_answer_with_bonus(text,text,jsonb,integer,numeric) from public, anon, authenticated;
grant execute on function public.submit_trivia_answer_with_bonus(text,text,jsonb,integer,numeric) to service_role;
