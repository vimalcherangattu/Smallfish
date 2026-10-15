-- Named contacts from Instantly SuperSearch (GTM, 2026-10-15).
--
-- The owner's call: the buyer is a person at a company that sells to small
-- businesses, not info@. `contactpipe.ts` buys them (one credit each) only
-- inside a monthly cap the owner sets in gtm_state.supersearch_budget, and
-- only as fast as the sending ramp can use them.
--
--   audience   'agency' (found by reading agency sites) or 'seller'
--              (a named leader at a company selling to a trade)
--   segment    which trade search found them
--   gtm_state  small key/value: list ids per segment, rotation, spend this
--              month, the owner's budget

alter table public.gtm_prospects
  add column if not exists first_name text,
  add column if not exists contact_name text,
  add column if not exists contact_title text,
  add column if not exists segment text,
  add column if not exists audience text not null default 'agency';
create index if not exists gtm_prospects_email_idx on public.gtm_prospects (email);

create table if not exists public.gtm_state (
  key text primary key,
  value jsonb not null,
  at timestamptz not null default now()
);
alter table public.gtm_state enable row level security;
