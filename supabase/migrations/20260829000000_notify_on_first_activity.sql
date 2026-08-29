-- Marks the moment a new account was announced, so the owner is told once per
-- person rather than once per request.
--
-- Nullable and set by a conditional UPDATE (see claimNewUserNotification):
-- "set notified_at = now() where id = $1 and notified_at is null" matches a row
-- exactly once no matter how many requests arrive concurrently, which is what
-- makes duplicate notifications impossible without any coordination.
alter table public.profiles
  add column notified_at timestamptz;

comment on column public.profiles.notified_at is
  'When the owner was notified that this account started using the site. Null = not yet announced.';
