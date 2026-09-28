-- Run once in the existing trivia Supabase project's SQL Editor before deploying this update.
-- Existing questions remain available and start with a blank category.
alter table public.questions add column if not exists category text not null default '';
