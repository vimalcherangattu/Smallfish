-- Claim one named job, rather than whichever is oldest.
--
-- `claim_job` (migration `0014`) is the scheduler's: it takes the oldest job
-- with work left, because a cron tick has no opinion about which. A person
-- watching their own read does have one, and there is a reason they need to be
-- able to act on it.
--
-- ## Why a person is allowed to drive the worker at all
--
-- The queue moves on a Vercel Cron entry, which needs `CRON_SECRET` set and a
-- plan that permits a minute-level schedule. Neither is fixable from inside this
-- repository, and until both exist **a queued read never finishes** — the
-- product's whole "any trade, any US city" promise sits behind somebody else's
-- billing page.
--
-- So a member of the workspace that owns a job may advance that job, one slice
-- per press. It is their own crawl and model budget, spent deliberately, on work
-- they asked for. It is also how a demo happens tomorrow rather than after a
-- plan upgrade.
--
-- ## It is the same lease, not a bypass of it
--
-- Two presses, or a press racing a cron tick, must not read the same sites
-- twice — reading twice costs money and annoys a web server that did nothing
-- wrong. `for update skip locked` and the lease do exactly what they do for the
-- scheduler; the only difference is which row is chosen.
--
-- The route above this still checks that the caller belongs to the job's
-- workspace. This function does not: it is service-role only, and a security
-- check that lives in two places is a security check that disagrees with itself.

create or replace function public.claim_this_job (
  p_job uuid,
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
   where j.id = p_job
     and j.state in ('queued', 'reading', 'judging')
     and (j.leased_until is null or j.leased_until < now())
     and exists (
       select 1 from public.job_sites s
        where s.job_id = j.id and s.state <> 'done'
     )
   for update of j skip locked;

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

revoke all on function public.claim_this_job (uuid, text, integer) from public, anon, authenticated;
grant execute on function public.claim_this_job (uuid, text, integer) to service_role;
