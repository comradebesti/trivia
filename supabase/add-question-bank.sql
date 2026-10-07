-- Additive migration. Run in the existing trivia project.
begin;
create table if not exists public.trivia_question_bank (
 id uuid primary key default gen_random_uuid(),
 content jsonb not null,
 status text not null default 'draft' check(status in ('draft','ready')),
 notes text not null default '', tags text not null default '',
 legacy_question_id bigint unique,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.trivia_question_bank enable row level security;
revoke all on public.trivia_question_bank from anon, authenticated;
grant all on public.trivia_question_bank to service_role;
alter table public.questions add column if not exists bank_id uuid references public.trivia_question_bank(id) on delete set null;
create index if not exists questions_bank_id on public.questions(bank_id);
-- Bring existing game questions into the bank once, preserving checked answers.
insert into public.trivia_question_bank(content,status,legacy_question_id)
select jsonb_build_object('stage',stage,'kind',kind,'prompt',prompt,'category',category,
'options',options,'correct',correct,'points',points,'bonusPrompt',bonus_prompt,
'bonusTarget',bonus_target,'bonusTolerance',bonus_tolerance), 'ready', id
from public.questions where bank_id is null
on conflict(legacy_question_id) do nothing;
update public.questions q set bank_id=b.id from public.trivia_question_bank b
where b.legacy_question_id=q.id and q.bank_id is null;
commit;
