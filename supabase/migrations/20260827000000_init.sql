-- Jessica - initial schema (spec sections 24, 50, 53, 54, 56)
--
-- Apply with:  supabase db push
-- or paste into the SQL editor of a fresh Supabase project.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null default ''
                 check (char_length(display_name) <= 60),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- challenges - the global, reusable topic pool (spec sections 65, 66)
--
-- embedding is 768-dimensional: gemini-embedding-001 is asked for
-- outputDimensionality=768 and the vector is L2-normalised client side, which
-- keeps rows small (500 MB free tier) and stays under pgvector's 2000-dim
-- index ceiling.
-- ---------------------------------------------------------------------------
create table public.challenges (
  id          uuid primary key default gen_random_uuid(),
  topic_text  text        not null,
  topic_key   text        not null unique,  -- normalizeTopic(); exact-duplicate guard
  category    text        not null,
  difficulty  smallint    not null default 2 check (difficulty between 1 and 3),
  source_type text        not null default 'generated'
                check (source_type in ('generated', 'cached_news', 'fresh_web')),
  embedding   extensions.vector(768),
  expires_at  timestamptz,                  -- null = evergreen (spec section 67)
  created_at  timestamptz not null default now()
);

-- Deliberately no HNSW index on embedding. Postgres can only use one for
-- `order by embedding <=> $1 limit k`, and both consumers here use the operator
-- as a WHERE predicate ("is this within threshold of anything I passed"), which
-- no vector index can serve. Building one would cost write time on every insert
-- and never be read. Add it the day a query actually ranks by distance.
create index challenges_category_idx on public.challenges (category);

-- ---------------------------------------------------------------------------
-- user_challenges - per-user assignment + lifecycle (spec sections 28-31)
-- ---------------------------------------------------------------------------
create table public.user_challenges (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  challenge_id uuid        not null references public.challenges (id) on delete cascade,
  status       text        not null default 'assigned'
                 check (status in ('assigned', 'processing', 'passed', 'failed', 'skipped')),
  assigned_at  timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, challenge_id)
);

create index user_challenges_user_idx on public.user_challenges (user_id, status);

-- At most one live challenge per user. This makes the refresh rule
-- (spec section 31) a database invariant rather than a hopeful convention.
create unique index user_challenges_one_active_idx
  on public.user_challenges (user_id)
  where status in ('assigned', 'processing', 'failed');

-- ---------------------------------------------------------------------------
-- attempts (spec section 50)
-- ---------------------------------------------------------------------------
create table public.attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid        not null references auth.users (id) on delete cascade,
  challenge_id     uuid        not null references public.challenges (id) on delete cascade,
  duration_seconds integer     not null check (duration_seconds >= 0),
  transcript       text        not null default '',
  overall_score    smallint,
  fluency_score    smallint,
  coherence_score  smallint,
  vocabulary_score smallint,
  relevance_score  smallint,
  structure_score  smallint,
  filler_count     smallint,
  feedback         jsonb       not null default '[]'::jsonb,
  status           text        not null
                     check (status in ('passed', 'failed', 'processing_error')),
  created_at       timestamptz not null default now()
);

create index attempts_user_created_idx on public.attempts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- ai_usage - provider quota observability (spec section 56)
-- ---------------------------------------------------------------------------
create table public.ai_usage (
  id           bigint generated always as identity primary key,
  provider     text        not null,
  model        text        not null,
  user_id      uuid        references auth.users (id) on delete set null,
  request_type text        not null,
  units        integer     not null default 0,  -- tokens, or audio seconds for STT
  ok           boolean     not null default true,
  created_at   timestamptz not null default now()
);

create index ai_usage_created_idx on public.ai_usage (created_at desc);

-- ---------------------------------------------------------------------------
-- topic_sources - cached current information (spec sections 18, 20, 51)
--
-- Level 2 of the topic strategy reads this table; level 3 refills it. Caching
-- is what keeps a burst of users from turning into a burst of feed fetches.
-- ---------------------------------------------------------------------------
create table public.topic_sources (
  id           bigint generated always as identity primary key,
  source_url   text        not null unique,
  source_title text        not null,
  source_text  text        not null default '',
  source_type  text        not null default 'news',
  published_at timestamptz,
  fetched_at   timestamptz not null default now(),
  expires_at   timestamptz not null
);

create index topic_sources_fresh_idx on public.topic_sources (expires_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security (spec sections 53-54)
--
-- The Worker uses the service role and bypasses these. They exist because the
-- anon key is public: they are the wall between one user's browser and another
-- user's history.
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.challenges      enable row level security;
alter table public.user_challenges enable row level security;
alter table public.attempts        enable row level security;
alter table public.ai_usage        enable row level security;
alter table public.topic_sources   enable row level security;

create policy "own profile readable" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

create policy "own profile writable" on public.profiles
  for update to authenticated using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- The topic pool is shared, but only the Worker may write to it.
create policy "challenges readable" on public.challenges
  for select to authenticated using (true);

create policy "own assignments" on public.user_challenges
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "own attempts" on public.attempts
  for select to authenticated using ((select auth.uid()) = user_id);

-- ai_usage and topic_sources deliberately have no policies: service role only.

-- ---------------------------------------------------------------------------
-- New user -> profile (spec section 50: the profile id is the auth user id)
-- ---------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- pick_unseen_challenge - reuse the global pool before spending AI quota
-- (spec sections 22-24, 64-65)
--
-- Returns a challenge the user has never been assigned and that is not
-- semantically equivalent to anything they have already passed.
-- ---------------------------------------------------------------------------
create function public.pick_unseen_challenge(
  p_user_id        uuid,
  p_category       text default null,
  p_max_similarity double precision default 0.91
)
returns setof public.challenges
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  -- Shortlist first, compare vectors second. Without this the cost is
  -- (whole pool x everything the user has passed) cosine distances on every
  -- single assignment; with it the vector work is bounded at 50 x passed.
  with candidates as (
    select c.*
    from public.challenges c
    where (p_category is null or c.category = p_category)
      and (c.expires_at is null or c.expires_at > now())
      and not exists (
        select 1 from public.user_challenges uc
        where uc.user_id = p_user_id and uc.challenge_id = c.id
      )
    order by random()
    limit 50
  )
  select c.*
  from candidates c
  where not exists (
    select 1
    from public.user_challenges uc
    join public.challenges done on done.id = uc.challenge_id
    where uc.user_id = p_user_id
      and uc.status = 'passed'
      and done.embedding is not null
      and c.embedding is not null
      and 1 - (c.embedding <=> done.embedding) > p_max_similarity
  )
  limit 1;
$fn$;

-- ---------------------------------------------------------------------------
-- is_duplicate_for_user - the accept/reject gate for a freshly generated topic
-- (spec sections 22-23, 25)
-- ---------------------------------------------------------------------------
create function public.is_duplicate_for_user(
  p_user_id        uuid,
  p_topic_key      text,
  p_embedding      extensions.vector(768),
  p_max_similarity double precision default 0.91
)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select exists (
    select 1
    from public.user_challenges uc
    join public.challenges c on c.id = uc.challenge_id
    where uc.user_id = p_user_id
      and uc.status = 'passed'
      and (
        c.topic_key = p_topic_key
        or (
          p_embedding is not null
          and c.embedding is not null
          and 1 - (c.embedding <=> p_embedding) > p_max_similarity
        )
      )
  );
$fn$;

-- ---------------------------------------------------------------------------
-- user_progress_totals - all-time figures (spec sections 42, 79-80)
--
-- These must not be derived from a page of recent attempts: capping the row
-- fetch would silently drop the OLDEST history, so an all-time longest streak
-- could shrink between page loads. Counting here has no such ceiling.
--
-- Rates are per TOPIC, not per attempt. "Passed" and "needed a retry" are not
-- complements - a topic can be both - so they are counted independently.
-- Mirrors computeTotals() in packages/types/src/logic.ts.
-- ---------------------------------------------------------------------------
create function public.user_progress_totals(p_user_id uuid)
returns table (
  total_attempts      bigint,
  topics_attempted    bigint,
  topics_passed       bigint,
  topics_retried      bigint,
  speaking_seconds    bigint,
  average_score       int,
  best_score          int,
  current_streak_days int,
  longest_streak_days int
)
language sql
stable
security definer
set search_path = public
as $fn$
  with scored as (
    select * from public.attempts
    where user_id = p_user_id and status <> 'processing_error'
  ),
  per_topic as (
    select challenge_id, count(*) as attempts, bool_or(status = 'passed') as passed
    from scored group by challenge_id
  ),
  days as (
    select distinct (created_at at time zone 'utc')::date as d
    from scored where status = 'passed'
  ),
  -- Gaps and islands: consecutive dates share (date - row_number).
  islands as (
    select d, d - (row_number() over (order by d))::int as grp from days
  ),
  -- Not having spoken yet today does not break a streak; missing a whole day does.
  anchor as (
    select case
             when exists (select 1 from days where d = (now() at time zone 'utc')::date)
               then (now() at time zone 'utc')::date
             else (now() at time zone 'utc')::date - 1
           end as a
  )
  select
    (select count(*) from scored),
    (select count(*) from per_topic),
    (select count(*) from per_topic where passed),
    (select count(*) from per_topic where attempts > 1),
    (select coalesce(sum(duration_seconds), 0) from scored),
    (select coalesce(round(avg(overall_score)), 0)::int from scored where status = 'passed'),
    (select coalesce(max(overall_score), 0)::int from scored where status = 'passed'),
    (select count(*)::int from islands
      where grp = (select i.grp from islands i, anchor a where i.d = a.a)),
    (select coalesce(max(len), 0)::int from (select count(*) as len from islands group by grp) r);
$fn$;

-- ---------------------------------------------------------------------------
-- delete_account - spec section 61
-- ---------------------------------------------------------------------------
create function public.delete_account(p_user_id uuid)
returns void
language sql
volatile
security definer
set search_path = ''
as $fn$
  delete from auth.users where id = p_user_id;  -- cascades to every table above
$fn$;

-- These are Worker-only entry points; the browser must not call them directly.
revoke all on function public.pick_unseen_challenge(uuid, text, double precision)
  from public, anon, authenticated;
revoke all on function public.is_duplicate_for_user(uuid, text, extensions.vector, double precision)
  from public, anon, authenticated;
revoke all on function public.user_progress_totals(uuid)
  from public, anon, authenticated;
revoke all on function public.delete_account(uuid)
  from public, anon, authenticated;
