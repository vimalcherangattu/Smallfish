-- Saved ICPs, and the two columns the live contact extraction has been waiting
-- on.
--
-- Three things in one migration because they are one piece of work: the owner's
-- 2026-10-08 flow is "describe what you sell, get the plan we would run, move
-- the checks around, save it, then read" — and the reading half has to come
-- back with contact details or the plan has nothing to deliver.
--
-- ## 1 · An ICP is a plan, stored as the plan
--
-- `src/lib/icpplan.ts` turns an offer description into a list of checks, each
-- marked must-have or nice-to-have and carrying how it gets settled. That shape
-- is the thing worth saving: re-deriving it from the description on every open
-- would mean a saved ICP silently changing when the signal catalogue grows,
-- which it did twice on the day this was written (three provable signals that
-- morning, six by the evening).
--
-- So `plan` is the edited plan as JSON, and `offer` is kept beside it for the
-- screen to show and for re-deriving on request — never automatically.
--
-- ## 2 · Contacts on a job site
--
-- `read.ts` now extracts emails, phones and a contact page while it is already
-- on the site (`src/lib/contacts.ts`, ported from the batch extractor). It had
-- nowhere to put them: a criterion about contacts could settle and be charged
-- for, while the address itself was thrown away. `contacts` is that column.
--
-- ## 3 · And the address, which makes attribution better
--
-- Attribution asks whether a page is really this business's, by looking for a
-- distinctive word from the name **or its town** in the page or the domain.
-- `supply.ts` fetches the address from Overture and drops it, so the live path
-- could only use the name. Measured on 570 dental businesses: 85% are named on
-- their own site, 83% mention their town, 93% do one or the other — so storing
-- the address recovers roughly the 8% that are reachable by town alone, and
-- those are currently withheld rather than wrong.

-- ---------------------------------------------------------------- 1 · icps --

create table if not exists public.icps (
  id          uuid primary key default gen_random_uuid (),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  /** What the customer called it. Theirs, not generated. */
  name        text not null check (length(btrim(name)) between 1 and 120),
  /** What they typed, or the text lifted out of a document they uploaded.
   *  Kept so the screen can show it and so the plan can be re-derived when
   *  they ask — never on its own. */
  offer       text not null default '',
  /**
   * The edited plan, as `icpplan.ts` shapes it.
   *
   * Stored rather than re-derived because the catalogue of provable signals
   * grows: a saved ICP that quietly gained a check the customer never chose is
   * a search that costs more than the one they saved.
   */
  plan        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  /** Soft, so a job that points at an ICP keeps something to point at. */
  archived_at timestamptz
);

comment on table public.icps is
  'A saved ICP: what they sell, and the edited plan of checks it became.';

-- One name per workspace, so "Dentists, no booking" cannot exist twice and
-- leave somebody guessing which one the job used. Partial, so an archived ICP
-- does not reserve its name forever.
create unique index if not exists icps_account_name_idx
  on public.icps (account_id, lower(btrim(name)))
  where archived_at is null;

create index if not exists icps_account_idx
  on public.icps (account_id, updated_at desc);

alter table public.icps enable row level security;

-- Members read their workspace's own. Writes go through the service role, like
-- every other write in this schema, so the application is the only thing that
-- decides what a valid plan looks like.
drop policy if exists icps_read on public.icps;
create policy icps_read on public.icps
  for select using (public.member_of (account_id));

revoke insert, update, delete on public.icps from anon, authenticated;
revoke all on public.icps from anon;
grant select on public.icps to authenticated;

/** Keep `updated_at` honest without the application remembering to. */
create or replace function public.touch_icp ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists icps_touch on public.icps;
create trigger icps_touch before update on public.icps
  for each row execute function public.touch_icp ();

-- ------------------------------------------------- 2 and 3 · job_sites --

-- Both nullable with no default: **absent means "not looked for on this read"**,
-- which is a different thing from "this business publishes nothing". The second
-- is said by `withheld` inside the JSON, and the distinction is the whole
-- discipline of `contacts.ts`.
alter table public.job_sites
  add column if not exists contacts jsonb;

comment on column public.job_sites.contacts is
  'Published contacts found while reading, as contacts.ts shapes them. Null means not looked for, not none found.';

-- The listing address, for attribution. `supply.ts` already fetches it.
alter table public.job_sites
  add column if not exists addr text;

comment on column public.job_sites.addr is
  'The address on the listing. Used to attribute a page to this business by its town; never shown as a verified address.';

/**
 * Record what a read found, contacts included.
 *
 * `record_sites` already takes a jsonb array of results and recomputes the
 * job's counters from the rows. This widens what one row may carry rather than
 * adding a second write: a contact written by a different call than the verdict
 * is a row that can be half-updated by a tick that dies between them, and the
 * whole file is built around a tick being able to die at any point.
 *
 * Replaces the body in `0014` with one extra assignment. Everything else is
 * unchanged, deliberately, so the diff is the new column and nothing else.
 */
create or replace function public.record_sites (p_job uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer;
begin
  update public.job_sites s
     set state        = 'done',
         verdict      = r.verdict,
         proof        = r.proof,
         pages        = coalesce(r.pages, 0),
         read_outcome = r.outcome,
         contacts     = r.contacts,
         done_at      = now()
    from jsonb_to_recordset(p_rows) as r (
           business_id text,
           verdict     text,
           proof       text,
           pages       integer,
           outcome     text,
           contacts    jsonb
         )
   where s.job_id = p_job
     and s.business_id = r.business_id;

  get diagnostics v_n = row_count;

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

  return v_n;
end;
$$;

revoke all on function public.record_sites (uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_sites (uuid, jsonb) to service_role;
