-- The browser never writes to a table. apps/web uses Supabase for auth only
-- (supabase.auth.*); every read and write of application data goes through the
-- Worker on the service role, which bypasses RLS. So "own profile writable"
-- granted a capability the app has never used - and it was not column-scoped.
--
-- What that allowed: profiles.notified_at records whether the owner has already
-- been told about an account (see claimNewUserNotification). Holding nothing but
-- the public anon key and their own session, a signed-in user could
--
--   PATCH /rest/v1/profiles?id=eq.<their own id>   {"notified_at": null}
--
-- and make the next request announce them again - an unbounded owner email or
-- push loop driven from one free account - or set it non-null once and suppress
-- the notification for their own account permanently.
--
-- Dropping the policy closes it: RLS is enabled on profiles, so with no UPDATE
-- policy the write is refused outright.
drop policy if exists "own profile writable" on public.profiles;

-- With that gone, state the client roles' privileges outright rather than
-- trusting the defaults. Supabase grants ALL on tables in `public` to anon and
-- authenticated, which leaves RLS as the only thing in the way - and TRUNCATE
-- is not subject to RLS at all. PostgREST never issues one, so this was not
-- reachable, but "safe because the API happens not to expose it" is not the
-- property to rely on.
--
-- Revoke everything, then grant back exactly what the design calls for: SELECT
-- for authenticated on the four tables whose read policies scope it to the
-- caller's own rows. anon gets nothing; every policy in the initial migration
-- is `to authenticated`, so an anonymous caller could never read a row anyway.
revoke all on public.profiles        from anon, authenticated;
revoke all on public.challenges      from anon, authenticated;
revoke all on public.user_challenges from anon, authenticated;
revoke all on public.attempts        from anon, authenticated;
revoke all on public.ai_usage        from anon, authenticated;
revoke all on public.topic_sources   from anon, authenticated;

grant select on public.profiles        to authenticated;
grant select on public.challenges      to authenticated;
grant select on public.user_challenges to authenticated;
grant select on public.attempts        to authenticated;
-- ai_usage and topic_sources stay unreadable: service role only, as before.
