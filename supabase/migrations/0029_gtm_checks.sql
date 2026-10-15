-- The free website checker (GTM, 2026-10-15).
--
-- One row per check: who (a daily-salted hash of the IP, never the IP), which
-- site, which signal, what we found, and which door sent them (`ref`, e.g. an
-- agency's embed). It is the rate limit, the cost meter and the funnel's first
-- step at once.
create table if not exists public.gtm_checks (
  id bigint generated always as identity primary key,
  visitor text not null,
  domain text,
  signal text not null,
  verdict text,
  ref text,
  at timestamptz not null default now()
);
create index if not exists gtm_checks_at_idx on public.gtm_checks (at);
create index if not exists gtm_checks_visitor_idx on public.gtm_checks (visitor, at);
alter table public.gtm_checks enable row level security;
