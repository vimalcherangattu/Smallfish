-- How many of a trade are in a city (GTM, automated SEO/AEO, 2026-10-16).
--
-- One row per /how-many/<trade>-in-<city>-<st> page: the count of listings
-- in the open Overture release, how many have a website, and the city's
-- population for the per-resident figure. Filled a few rows at a time by
-- /api/outreach/counts on pg_cron, refreshed monthly. A page exists only once
-- its row does, so nothing is ever rendered from a guess.
create table if not exists public.gtm_counts (
  slug text primary key,
  trade text not null,
  label text not null,
  city text not null,
  state text not null,
  pop int,
  listings int not null,
  with_site int not null,
  release text not null,
  computed_at timestamptz not null default now()
);
create index if not exists gtm_counts_trade_idx on public.gtm_counts (trade);
create index if not exists gtm_counts_city_idx on public.gtm_counts (city, state);
alter table public.gtm_counts enable row level security;
