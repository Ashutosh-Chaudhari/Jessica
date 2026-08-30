-- DAILY_AI_BUDGET was read-then-checked: the Worker counted rows in ai_usage at
-- request entry, but those rows are only written after the response is sent. So
-- requests arriving together all counted the same stale total, all passed the
-- check, and all went on to spend provider quota. The ceiling bound sequential
-- traffic and nothing else - which is the one case it was never needed for.
--
-- The fix is to claim the spend before making it, through something the database
-- serialises. UPDATE takes a row lock, so concurrent callers queue on the same
-- day's row and each re-evaluates the predicate against the committed total.
--
-- ai_usage is unchanged and still the per-call audit trail: what each provider
-- was asked for, whether it worked, and what the owner notification reports.
-- This table is only the counter that has to be right under concurrency.

create table public.ai_budget (
  day  date primary key,
  used integer not null default 0 check (used >= 0)
);

alter table public.ai_budget enable row level security;
-- No policies, like ai_usage and topic_sources: service role only. A new table
-- inherits Supabase's default GRANT ALL to anon and authenticated, so take that
-- away too rather than leaving RLS as the only thing refusing them.
revoke all on public.ai_budget from anon, authenticated;

comment on table public.ai_budget is
  'Provider calls claimed per UTC day. One row per day; its row lock is what makes the budget hold when requests arrive together.';

-- Claims p_calls if the day can still afford them. Returns false without
-- charging anything when it cannot, and the caller declines the request.
create function public.reserve_ai_calls(p_calls integer, p_budget integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  granted boolean;
begin
  if p_budget <= 0 then
    return true; -- cap disabled
  end if;

  insert into public.ai_budget (day, used)
  values ((now() at time zone 'utc')::date, 0)
  on conflict (day) do nothing;

  update public.ai_budget
     set used = used + p_calls
   where day = (now() at time zone 'utc')::date
     and used + p_calls <= p_budget
  returning true into granted;

  return coalesce(granted, false);
end;
$fn$;

-- Reconciles the estimate against what the request actually spent. Negative
-- hands budget back - the common case, because a topic served from the shared
-- pool costs nothing - and positive charges an overrun. Never gated: this one
-- records what happened rather than deciding whether it may.
create function public.settle_ai_calls(p_delta integer)
returns void
language sql
security definer
set search_path = ''
as $fn$
  update public.ai_budget
     set used = greatest(0, used + p_delta)
   where day = (now() at time zone 'utc')::date;
$fn$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC; neither of these belongs on the
-- public API surface (see 20260828000000_revoke_trigger_function_execute.sql).
revoke all on function public.reserve_ai_calls(integer, integer) from public, anon, authenticated;
revoke all on function public.settle_ai_calls(integer)           from public, anon, authenticated;
