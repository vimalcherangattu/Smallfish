-- Small Fish · run history, so the product remembers (S2-12)
--
-- Until now a search left no trace. Somebody could read a market, close the
-- tab, and come back the next day to a product that had never met them. That is
-- not a missing feature so much as a missing sense that the thing has state —
-- and it is the first thing a returning user looks for.
--
-- **A run is keyed on the search, not on the sitting.** The primary key is
-- (account, market, criterion), the same shape as `unlocks` and `pushes`, so
-- opening the same market twice is one row with `times = 2` rather than two
-- identical entries. The alternative — a row per page load — produces a history
-- that is mostly noise within a day, and the question a user asks is "what have
-- I searched", not "how many times did I refresh".
--
-- **The tallies are snapshotted.** Today the markets are static, so a run could
-- be re-rendered from its market file and the numbers would match. That stops
-- being true the moment a market can be re-read: the page would then quietly
-- show today's numbers under yesterday's date. Storing what was found at the
-- time costs one jsonb column and means a run is a record rather than a
-- re-query.
--
-- What is deliberately **not** stored is the matched business ids. That belongs
-- with cold reads, where a result is genuinely not reproducible — and storing a
-- market's worth of ids per run, per account, for data we already hold, would
-- be a large table earning nothing today. The comment is here so that whoever
-- adds cold reads knows this was a decision rather than an oversight.

create table public.runs (
  account_id   uuid not null references public.accounts (id) on delete cascade,
  market_id    text not null,
  criterion_id text not null,

  -- What the person typed, when they arrived through the search box. Null when
  -- they opened a market directly, which is not the same thing as an empty
  -- search and should not read as one.
  query        text,
  -- How the region resolved: city, state or country. Null for a market opened
  -- from the list.
  scope        text check (scope in ('city', 'state', 'country')),
  region_label text,

  -- What was found, as of the last time it ran.
  matched      integer not null default 0 check (matched >= 0),
  judged       integer not null default 0 check (judged >= 0),
  tallies      jsonb not null default '{}'::jsonb,

  first_run_at timestamptz not null default now(),
  last_run_at  timestamptz not null default now(),
  times        integer not null default 1 check (times > 0),

  primary key (account_id, market_id, criterion_id)
);

create index runs_recent_idx on public.runs (account_id, last_run_at desc);

alter table public.runs enable row level security;

create policy runs_read on public.runs
  for select using (public.member_of (account_id));

-- Writes go through `record_run` with the service role, like every other table
-- here. A client that can write its own run history can write anything into it.
revoke insert, update, delete on public.runs from anon, authenticated;

create or replace function public.record_run (
  p_account uuid,
  p_market text,
  p_criterion text,
  p_query text default null,
  p_scope text default null,
  p_region text default null,
  p_matched integer default 0,
  p_judged integer default 0,
  p_tallies jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.runs (
    account_id, market_id, criterion_id, query, scope, region_label,
    matched, judged, tallies
  )
  values (
    p_account, p_market, p_criterion, p_query, p_scope, p_region,
    greatest(coalesce(p_matched, 0), 0), greatest(coalesce(p_judged, 0), 0),
    coalesce(p_tallies, '{}'::jsonb)
  )
  on conflict (account_id, market_id, criterion_id) do update
    set last_run_at  = now(),
        times        = public.runs.times + 1,
        matched      = excluded.matched,
        judged       = excluded.judged,
        tallies      = excluded.tallies,
        -- Keep the query that started this search if the latest visit arrived
        -- without one. Somebody who typed "med spas in Dallas that have no
        -- online booking" and later opened the same market from a list should
        -- not lose the sentence that explains why the run exists.
        query        = coalesce(excluded.query, public.runs.query),
        scope        = coalesce(excluded.scope, public.runs.scope),
        region_label = coalesce(excluded.region_label, public.runs.region_label);
$$;

revoke all on function public.record_run (uuid, text, text, text, text, text, integer, integer, jsonb)
  from public, anon, authenticated;
