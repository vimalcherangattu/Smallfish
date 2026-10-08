-- Keep looking until we find what was asked for, then widen the horizon.
--
-- ## The failure this is for
--
-- A real search: two gyms in Dallas with no live chat. We attached twelve
-- sites, read all twelve, matched none, and stopped — with 1,542 readable gyms
-- in the region. The customer asked for two and got nothing, and the screen
-- reported it as a fact about Dallas.
--
-- Nothing was broken. The job's work list is sized by `sizing.ts` from a
-- **match-rate estimate** — 7 to 12 reads to find 2, derived from the four
-- measured markets — and a job is finished when its list is empty. So when the
-- estimate is wrong the read ends early and quietly, which is exactly when the
-- customer most needs it to carry on.
--
-- ## What a job has to remember to carry on
--
-- It knew what it had read and nothing about what it was looking for. Three
-- columns, and the region is re-resolved from `query` rather than stored, so
-- there is one definition of where a search covers.
--
--   - `want` — how many matches were asked for. The reason to stop, and
--     missing, so the worker could not stop early when it had enough either.
--     That half saves money: a job that has found its two need not read the
--     other ten.
--   - `categories` — the trade categories the customer confirmed. A top-up
--     that re-derived these from the query could pick a different set than the
--     one they agreed to on the confirm screen.
--   - `radius_miles` — the horizon, which now moves. `supply.ts` had 25 miles
--     as a constant.
--
-- ## The bound that does not move
--
-- `READS_PER_CREDIT` still caps the whole thing. "Keep looking" means keep
-- looking **within what the customer's balance pays for** — 11 reads per
-- credit, which is what keeps every plan solvent when nothing matches. A read
-- that widened for ever would be a bill that widened for ever. When that
-- budget is the thing that stops a search, the screen says so, because "we ran
-- out of your reading" and "there are no more businesses" are different
-- answers and only one of them is fixed by buying credits.

alter table public.jobs
  add column if not exists want integer check (want is null or want > 0);

comment on column public.jobs.want is
  'Matches asked for. The worker stops early when it has them, and keeps looking when it has not.';

alter table public.jobs
  add column if not exists categories text[];

comment on column public.jobs.categories is
  'The trade categories confirmed on screen, so a top-up searches the same set rather than re-deriving one.';

alter table public.jobs
  add column if not exists radius_miles integer
  check (radius_miles is null or radius_miles between 1 and 500);

comment on column public.jobs.radius_miles is
  'Current horizon in miles. Widens when the region is exhausted before the target is met.';

/**
 * Add sites to a job that is already running, and reopen it.
 *
 * `add_job_sites` inserts rows and is idempotent, but it does not touch the
 * job: a job released as `done` stays done, so topping one up through it would
 * leave the new rows unread for ever. This does both under one statement, so a
 * tick that dies between them cannot leave a job holding work it will never
 * claim.
 *
 * `sites_total` is incremented rather than recomputed. It is the denominator
 * the progress bar draws, and recomputing it from `job_sites` would be the
 * same number by a longer route — until a top-up raced a read and it was not.
 */
create or replace function public.extend_job (
  p_job   uuid,
  p_rows  jsonb,
  p_radius integer default null
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_added integer;
begin
  insert into public.job_sites (job_id, business_id, name, site, phone, ordinal)
  select p_job, r.business_id, r.name, r.site, r.phone,
         coalesce((select max(ordinal) from public.job_sites where job_id = p_job), 0) + r.ordinal
    from jsonb_to_recordset(p_rows) as r (
           business_id text, name text, site text, phone text, ordinal integer
         )
  on conflict (job_id, business_id) do nothing;

  get diagnostics v_added = row_count;

  update public.jobs
     set sites_total  = sites_total + v_added,
         -- Back to work. A job topped up while `done` would never be claimed.
         state        = case when v_added > 0 then 'reading' else state end,
         finished_at  = case when v_added > 0 then null else finished_at end,
         radius_miles = coalesce(p_radius, radius_miles)
   where id = p_job;

  return v_added;
end;
$$;

revoke all on function public.extend_job (uuid, jsonb, integer) from public, anon, authenticated;
grant execute on function public.extend_job (uuid, jsonb, integer) to service_role;
