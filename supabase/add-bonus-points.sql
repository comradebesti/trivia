-- Run once in the existing trivia Supabase project's SQL Editor before deploying this update.
-- Existing teams keep their scores and start with zero bonus points.
alter table public.teams add column if not exists bonus_points integer not null default 0;
