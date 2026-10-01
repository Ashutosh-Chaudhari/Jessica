-- Skipping became a first-class action, so the four states the product talks
-- about - shown, started, completed, skipped - all have to be readable from the
-- database. Three of them already were: 'assigned', 'passed'/'failed' and
-- 'skipped'. Only "the speaker opened the microphone but never sent anything"
-- had nowhere to live.
--
-- It is a timestamp rather than a new status on purpose. user_challenges_one_active_idx
-- covers 'assigned', 'processing' and 'failed', so a status written at an action
-- the user can simply walk away from (closing the tab mid-recording) would be
-- the stranded-forever state that apps/worker/src/services/pipeline.ts removed
-- for exactly that reason. A nullable column is in no index and blocks nothing.
--
-- It is also the missing half of the personalisation data: joined to
-- challenges.category, user_challenges now answers "which subjects does this
-- person skip, which do they open, and which do they finish" without any new
-- table. No recommender is built on it yet - the point is that it is being
-- recorded from today rather than backfilled from nothing later.
alter table public.user_challenges
  add column started_at timestamptz;

comment on column public.user_challenges.started_at is
  'When the speaker opened the microphone for this topic. Null = shown but never started. Deliberately not a status: it must never be able to block a new assignment.';
