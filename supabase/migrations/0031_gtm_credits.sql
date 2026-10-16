-- "Website by X" footer credits (GTM, agency prospects, 2026-10-16).
--
-- One row per local business home page read: which agency's credit was on
-- it, if any. A row with no agency still matters, it is how the next run
-- knows the page was read. We keep the credit, never the page.
create table if not exists public.gtm_credits (
  site_domain text primary key,
  agency_domain text,
  agency_name text,
  phrase text,
  trade text not null,
  city text not null,
  state text not null,
  scanned_at timestamptz not null default now()
);
create index if not exists gtm_credits_agency_idx on public.gtm_credits (agency_domain) where agency_domain is not null;
create index if not exists gtm_credits_pair_idx on public.gtm_credits (trade, city, state);
alter table public.gtm_credits enable row level security;
