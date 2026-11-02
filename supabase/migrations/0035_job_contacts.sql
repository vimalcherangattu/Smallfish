-- Contacts found while reading, kept on the job row (2026-11-02).
--
-- `read.ts` has extracted published contacts since 2026-10-08 and the worker
-- has sent them with every verdict, but `job_sites` had no column for them and
-- `record_sites` (0014) never named one, so `jsonb_to_recordset` dropped them.
-- Every job on a cold city therefore showed the listed phone and **no email,
-- ever**. Named people (owners, founders, credentialed staff) were added to the
-- same object the same day, measured on 35 real sites.
--
-- This is the contacts half of the never-applied 0022, rewritten against the
-- function as it actually stands in production: 0022's version also changed the
-- return type and dropped two details of 0014 (`taken_at = null`, trimming an
-- empty proof), so it is not applied. The ICP table in 0022 is GEW and unneeded.
--
-- Nullable, no default: absent means "not looked for on this read", which is a
-- different thing from "publishes nothing" (that is `withheld` inside it).

alter table public.job_sites
  add column if not exists contacts jsonb;

comment on column public.job_sites.contacts is
  'Published contacts and named people found while reading, as contacts.ts shapes them. Null means not looked for, not none found.';

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
         contacts     = r.contacts,
         done_at      = now(),
         taken_at     = null
    from jsonb_to_recordset(p_rows)
      as r (business_id text, verdict text, proof text, pages integer, outcome text, contacts jsonb)
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

revoke all on function public.record_sites (uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_sites (uuid, jsonb) to service_role;
