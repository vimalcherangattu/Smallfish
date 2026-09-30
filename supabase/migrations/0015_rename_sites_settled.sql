-- Bring the live database back in step with `0011`.
--
-- ## What happened
--
-- `0011` shipped the column as `sites_settled`, and was applied. `test_schema.py`
-- then rejected the name — "settle" is reserved for band settlement, which
-- `pricing.ts` owns without a database — so the column was renamed to
-- `sites_judged` **in the migration file**, matching `runs.judged`, and every
-- line of TypeScript was written against the new name.
--
-- The file and the code agreed. The database did not, because the rename was
-- made to a migration that had already run.
--
-- ## Why nothing caught it
--
-- Nothing had ever written a job's progress. `advance_job` was recreated from
-- the corrected text and refers to `sites_judged`, so **every call to it would
-- have failed at runtime** — and the only caller is the worker, which did not
-- exist. The first tick of the first worker would have been the discovery.
--
-- `notify.ts` is the other casualty: `readFinishedEmail` prints
-- `job.sites_judged.toLocaleString()`, which throws on `undefined`, so the one
-- message a person is waiting for would have thrown rather than sent.
--
-- ## The lesson, recorded rather than fixed
--
-- Editing an applied migration makes a repository that is correct for a *fresh*
-- database and wrong for the one in production, and a fresh database is the one
-- nobody runs. A correcting migration is the only version of a rename that both
-- of them end up agreeing on.

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'jobs'
       and column_name = 'sites_settled'
  ) and not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'jobs'
       and column_name = 'sites_judged'
  ) then
    alter table public.jobs rename column sites_settled to sites_judged;
  end if;
end $$;

comment on column public.jobs.sites_judged is
  'Sites a verdict was reached on. Named to match runs.judged — one word per idea.';
