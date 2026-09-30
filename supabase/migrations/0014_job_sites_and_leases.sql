-- The work list, and the lease that lets more than one worker exist.
--
-- `jobs` (migration 0011) records that a read was asked for and how far it has
-- got. It does not record **what there is to read**, and that gap is why the
-- queue has never moved: a job for "dental practices in Phoenix" is a sentence,
-- and a worker cannot fetch a sentence.
--
-- ## Why the sites are rows rather than a list on the job
--
-- Three reasons, and the third is the one that decides it:
--
--   1. A slice of work has to be claimable. A worker gets ~50 seconds before
--      the platform stops it, reads what it can, and the next tick continues.
--      That only works if "what is left" is a query rather than an offset into
--      a blob somebody has to keep in sync.
--   2. The counters become derivable. `sites_read`, `matched` and `unclear` are
--      counted from these rows rather than incremented, so a retried slice
--      cannot double-count and a crashed one cannot lose a result.
--   3. **It is the same table whatever the sites came from.** Today they come
--      from a market we have already extracted; tomorrow from a CSV the
--      customer uploaded, and later from an Overture pull. Three sources, one
--      work list, one worker — rather than a worker that grows a branch per
--      source.
--
-- ## What is deliberately not here
--
-- Page copies. `CLAUDE.md`'s rule is "store extracted facts, not page copies",
-- so a finished row carries the verdict, the quoted proof and how many pages
-- were read. The pages themselves are dropped the moment they are judged.

create table if not exists public.job_sites (
  job_id       uuid not null references public.jobs (id) on delete cascade,
  -- The candidate's id in whatever source it came from. Not a foreign key:
  -- a CSV upload's rows exist nowhere else.
  business_id  text not null,
  name         text,
  site         text not null,
  phone        text,
  -- Reading order, so a partly-finished job resumes where it stopped rather
  -- than wherever the planner happened to sort.
  ordinal      integer not null default 0,

  state        text not null default 'pending'
               check (state in ('pending', 'taken', 'done')),
  -- Set while a worker holds this row, so a tick that dies does not strand it
  -- forever: a `taken` row older than the lease is returned to `pending`.
  taken_at     timestamptz,

  verdict      text check (verdict in
                 ('match', 'no_match', 'couldnt_tell', 'blocked', 'needs_model')),
  proof        text,
  pages        integer not null default 0 check (pages >= 0),
  -- ok | blocked | timeout | dns | http_4xx … Our failures are recorded as ours.
  read_outcome text,
  done_at      timestamptz,

  primary key (job_id, business_id)
);

-- The worker's only read: the next few pending sites of one job, in order.
create index if not exists job_sites_next_idx
  on public.job_sites (job_id, ordinal)
  where state = 'pending';

-- Sweeping stranded rows back to pending.
create index if not exists job_sites_taken_idx
  on public.job_sites (taken_at)
  where state = 'taken';

alter table public.job_sites enable row level security;

-- A member may watch their own job's sites. There is nothing secret in a row
-- that is `pending` — it is a business with a website — and a row that is
-- `done` carries the verdict they are paying attention to.
drop policy if exists job_sites_read on public.job_sites;
create policy job_sites_read on public.job_sites
  for select using (
    exists (
      select 1 from public.jobs j
       where j.id = job_sites.job_id and public.member_of (j.account_id)
    )
  );

revoke insert, update, delete on public.job_sites from anon, authenticated;
revoke all on public.job_sites from anon;
grant select on public.job_sites to authenticated;

-- ------------------------------------------------------------- the lease --
--
-- Two ticks of a cron overlap far more often than people expect: a slow slice,
-- a retry, a redeploy mid-run. Without a lease both would read the same sites,
-- spend the crawl budget twice and — because judging costs money — bill us
-- twice for one answer.
alter table public.jobs
  add column if not exists leased_until  timestamptz,
  add column if not exists lease_holder  text,
  -- Why a tick declined to work on this job, in the person's terms. Distinct
  -- from `failure`, which ends the job: this is "not now" rather than "never".
  add column if not exists worker_note   text;

comment on column public.jobs.leased_until is
  'While in the future, another worker holds this job. Expiry returns it.';

/**
 * Take the oldest job that has work left, or return nothing.
 *
 * `for update skip locked` is the whole mechanism, and it is doing two separate
 * jobs: the row lock makes the claim atomic against a concurrent tick, and
 * `skip locked` means a second worker moves on to the next job rather than
 * blocking behind the first. A worker pool that serialises on one row is one
 * worker with extra steps.
 *
 * The lease is belt and braces on top of it: the lock lasts for this statement,
 * the lease lasts for the slice.
 */
create or replace function public.claim_job (
  p_holder text,
  p_lease_seconds integer default 120
) returns public.jobs
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job public.jobs;
begin
  select j.* into v_job
    from public.jobs j
   where j.state in ('queued', 'reading', 'judging')
     and (j.leased_until is null or j.leased_until < now())
     and exists (
       select 1 from public.job_sites s
        where s.job_id = j.id and s.state <> 'done'
     )
   order by j.created_at
   for update of j skip locked
   limit 1;

  if v_job.id is null then
    return null;
  end if;

  update public.jobs
     set leased_until = now() + make_interval(secs => greatest(p_lease_seconds, 10)),
         lease_holder = p_holder,
         state        = case when state = 'queued' then 'reading' else state end,
         started_at   = coalesce(started_at, now()),
         worker_note  = null
   where id = v_job.id
  returning * into v_job;

  return v_job;
end;
$$;

/**
 * Take the next `p_n` sites of a job to read.
 *
 * Rows go `pending` → `taken` here and `taken` → `done` when a result arrives.
 * A tick that dies in between leaves them `taken`, which `sweep_stranded_sites`
 * returns — so the failure mode is a site read twice, never a site silently
 * skipped. That is the right way round: reading twice costs a crawl, skipping
 * silently costs a customer a business that was there.
 */
create or replace function public.take_sites (p_job uuid, p_n integer default 20)
returns setof public.job_sites
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.job_sites s
     set state = 'taken', taken_at = now()
   where (s.job_id, s.business_id) in (
     select job_id, business_id
       from public.job_sites
      where job_id = p_job and state = 'pending'
      order by ordinal
      for update skip locked
      limit greatest(p_n, 1)
   )
  returning s.*;
end;
$$;

/** Rows a dead worker left claimed. Returned to the queue, never lost. */
create or replace function public.sweep_stranded_sites (p_older_seconds integer default 600)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  update public.job_sites
     set state = 'pending', taken_at = null
   where state = 'taken'
     and taken_at < now() - make_interval(secs => greatest(p_older_seconds, 60));
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

/**
 * Record a slice of results, and recompute the job's counters from them.
 *
 * **Recomputed, not incremented.** Incrementing makes a retried slice
 * double-count and a crashed one lose results; counting the rows makes both
 * harmless, because `job_sites` is the ground truth and the counters are a
 * view of it. `advance_job` keeps its monotonic guards for the state machine;
 * these numbers do not need them, since a count over rows that only ever move
 * forward can only go up.
 *
 * `p_rows` is one JSON array for the whole slice. Twenty round trips inside a
 * fifty-second budget is a measurable fraction of the budget.
 */
create or replace function public.record_sites (p_job uuid, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.job_sites s
     set state        = 'done',
         verdict      = r.verdict,
         proof        = nullif(btrim(coalesce(r.proof, '')), ''),
         pages        = greatest(coalesce(r.pages, 0), 0),
         read_outcome = r.outcome,
         done_at      = now(),
         taken_at     = null
    from jsonb_to_recordset(p_rows)
      as r (business_id text, verdict text, proof text, pages integer, outcome text)
   where s.job_id = p_job and s.business_id = r.business_id;

  update public.jobs j
     set sites_read    = c.read,
         sites_judged  = c.judged,
         matched       = c.matched,
         unclear       = c.unclear
    from (
      select
        count(*) filter (where state = 'done')                              as read,
        count(*) filter (where verdict in ('match', 'no_match'))            as judged,
        count(*) filter (where verdict = 'match')                           as matched,
        count(*) filter (where verdict in ('couldnt_tell','blocked','needs_model')) as unclear
        from public.job_sites
       where job_id = p_job
    ) c
   where j.id = p_job;
end;
$$;

/**
 * Hand the job back.
 *
 * One call for all three endings, because they differ only in what is written:
 * finished (no sites left), stopped for a stated reason, or simply out of time
 * and to be picked up by the next tick. A worker that has to remember which of
 * three functions to call is a worker that will call none of them on the path
 * nobody tested.
 */
create or replace function public.release_job (
  p_job uuid,
  p_note text default null,
  p_failure text default null
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_left integer;
  v_state text;
begin
  select count(*) into v_left
    from public.job_sites where job_id = p_job and state <> 'done';

  v_state := case
               when p_failure is not null then 'failed'
               when v_left = 0 then 'done'
               else 'reading'
             end;

  update public.jobs
     set state        = v_state,
         leased_until = null,
         lease_holder = null,
         worker_note  = nullif(btrim(coalesce(p_note, '')), ''),
         failure      = coalesce(p_failure, failure),
         finished_at  = case when v_state in ('done','failed') then now() else finished_at end
   where id = p_job;

  return v_state;
end;
$$;

/** Put a job's work list in place. Idempotent: re-queueing the same market does
 *  not duplicate a site, and does not reset one already read. */
create or replace function public.add_job_sites (p_job uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  insert into public.job_sites (job_id, business_id, name, site, phone, ordinal)
  select p_job, r.business_id, r.name, r.site, r.phone,
         coalesce(r.ordinal, row_number() over ())
    from jsonb_to_recordset(p_rows)
      as r (business_id text, name text, site text, phone text, ordinal integer)
   where coalesce(btrim(r.site), '') <> ''
  on conflict (job_id, business_id) do nothing;

  get diagnostics v_n = row_count;

  update public.jobs
     set sites_total = (select count(*) from public.job_sites where job_id = p_job)
   where id = p_job;

  return v_n;
end;
$$;

revoke all on function public.claim_job (text, integer) from public, anon, authenticated;
revoke all on function public.take_sites (uuid, integer) from public, anon, authenticated;
revoke all on function public.sweep_stranded_sites (integer) from public, anon, authenticated;
revoke all on function public.record_sites (uuid, jsonb) from public, anon, authenticated;
revoke all on function public.release_job (uuid, text, text) from public, anon, authenticated;
revoke all on function public.add_job_sites (uuid, jsonb) from public, anon, authenticated;

grant execute on function public.claim_job (text, integer) to service_role;
grant execute on function public.take_sites (uuid, integer) to service_role;
grant execute on function public.sweep_stranded_sites (integer) to service_role;
grant execute on function public.record_sites (uuid, jsonb) to service_role;
grant execute on function public.release_job (uuid, text, text) to service_role;
grant execute on function public.add_job_sites (uuid, jsonb) to service_role;
