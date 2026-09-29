-- Reads that take long enough to leave.
--
-- Reading a market cold is not a request-response: every dental practice in
-- Phoenix with a website is 2,778 sites, which at the crawler's real settings —
-- twelve in flight, 1.5s between requests to one host, 3.4 pages a site — is
-- about twenty-four minutes before a model has judged anything. A whole state
-- is a couple of hours. No browser waits for that, so the work gets a row, the
-- person gets a page that shows it happening, and a note goes out at the end.
--
-- ## The counters are the product's honesty, in a table
--
-- `sites_total`, `sites_read`, `sites_judged`, `matched`, `unclear`. They are
-- written as the work happens and read straight onto the progress page, so what
-- somebody watches is what is true rather than a bar that fills on a timer. The
-- request that prompted this asked for a wait that conveys how much work goes
-- on; the work is genuinely large and these are the numbers that say so.
--
-- `unclear` has a column of its own rather than being inferred, because it is
-- the number this product refuses to hide: sites read and still without a verdict,
-- never billed, never exported.

create table public.jobs (
  id           uuid primary key default gen_random_uuid (),
  account_id   uuid not null references public.accounts (id) on delete cascade,

  -- What the person typed, and what it resolved to.
  query        text not null,
  market_id    text,
  criterion_id text,
  region_label text,

  state        text not null default 'queued'
               check (state in ('queued', 'reading', 'judging', 'done', 'failed')),

  sites_total   integer not null default 0 check (sites_total >= 0),
  sites_read    integer not null default 0 check (sites_read >= 0),
  sites_judged integer not null default 0 check (sites_judged >= 0),
  matched       integer not null default 0 check (matched >= 0),
  unclear       integer not null default 0 check (unclear >= 0),

  -- Seconds, from `estimateSeconds` at the moment of queueing. Kept so that a
  -- finished job can be compared against what it promised — an estimate nobody
  -- ever checks is a number nobody should trust.
  estimate_seconds integer not null default 0 check (estimate_seconds >= 0),

  -- Where the "it is done" note goes. Null means nobody asked to be told.
  notify_email text,
  notified_at  timestamptz,

  -- Set when the job ends badly, and shown to the person as-is rather than as
  -- "something went wrong".
  failure      text,

  created_at   timestamptz not null default now(),
  started_at   timestamptz,
  finished_at  timestamptz
);

create index jobs_account_idx on public.jobs (account_id, created_at desc);
-- The worker's own queue scan: oldest queued job first.
create index jobs_queue_idx on public.jobs (state, created_at)
  where state in ('queued', 'reading', 'judging');

alter table public.jobs enable row level security;

-- A member of the workspace may watch their own jobs, and nothing else.
create policy jobs_read on public.jobs
  for select using (public.member_of (account_id));

-- Every write goes through the functions below with the service role, for the
-- same reason as `runs`: a client that can write its own progress counters can
-- write "42 matched" without a single site having been read.
revoke insert, update, delete on public.jobs from anon, authenticated;
revoke all on public.jobs from anon;
grant select on public.jobs to authenticated;

-- ---------------------------------------------------------------- queueing --
create or replace function public.queue_job (
  p_account uuid,
  p_query text,
  p_market text default null,
  p_criterion text default null,
  p_region text default null,
  p_sites integer default 0,
  p_estimate integer default 0,
  p_email text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.jobs (
    account_id, query, market_id, criterion_id, region_label,
    sites_total, estimate_seconds, notify_email
  )
  values (
    p_account, p_query, p_market, p_criterion, p_region,
    greatest(p_sites, 0), greatest(p_estimate, 0), p_email
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------- progress --
--
-- Counters only ever go up, and `state` only ever moves forward. A worker that
-- retries a batch must not be able to walk `sites_read` backwards, because the
-- number on somebody's screen going down is worse than it being stale.
create or replace function public.advance_job (
  p_job uuid,
  p_state text default null,
  p_read integer default null,
  p_judged integer default null,
  p_matched integer default null,
  p_unclear integer default null,
  p_failure text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.jobs
     set state         = coalesce(p_state, state),
         sites_read    = greatest(sites_read, coalesce(p_read, sites_read)),
         sites_judged = greatest(sites_judged, coalesce(p_judged, sites_judged)),
         matched       = greatest(matched, coalesce(p_matched, matched)),
         unclear       = greatest(unclear, coalesce(p_unclear, unclear)),
         failure       = coalesce(p_failure, failure),
         started_at    = case
                           when started_at is null and coalesce(p_state, state) <> 'queued'
                           then now() else started_at
                         end,
         finished_at   = case
                           when p_state in ('done', 'failed') then now()
                           else finished_at
                         end
   where id = p_job;
end;
$$;

-- Marks the note as sent, so a retrying sender cannot write twice.
create or replace function public.mark_job_notified (p_job uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer;
begin
  update public.jobs
     set notified_at = now()
   where id = p_job and notified_at is null
  returning 1 into v_updated;

  return coalesce(v_updated, 0) = 1;
end;
$$;

revoke all on function public.queue_job (uuid, text, text, text, text, integer, integer, text) from public, anon, authenticated;
revoke all on function public.advance_job (uuid, text, integer, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.mark_job_notified (uuid) from public, anon, authenticated;
grant execute on function public.queue_job (uuid, text, text, text, text, integer, integer, text) to service_role;
grant execute on function public.advance_job (uuid, text, integer, integer, integer, integer, text) to service_role;
grant execute on function public.mark_job_notified (uuid) to service_role;
