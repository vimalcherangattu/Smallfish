-- How many of a count's listed websites are actually there (2026-11-02).
--
-- The GTM stream measured 8–14% of the websites listed for businesses in
-- customer trades as dead domains, and `/app/find` counted every one of them
-- as "a website we can read". The count route now checks a random sample of a
-- pool's listed sites against public DNS on a cache miss and keeps the result
-- here, beside the count it qualifies, so every screen that reads the cached
-- count (`/app/find`, and the screen after it) says the same live number.
--
-- Additive and nullable: a row written before this, or by a path that had no
-- site list to sample, simply has no measurement, and the screens then say
-- "list a website" rather than claiming they are readable.

alter table public.supply_counts
  add column if not exists live_checked integer check (live_checked is null or live_checked >= 0),
  add column if not exists live_dead integer check (live_dead is null or live_dead >= 0);

comment on column public.supply_counts.live_checked is
  'Listed websites checked against public DNS (dns.google) for this count. Null: not measured.';
comment on column public.supply_counts.live_dead is
  'Of those, how many public DNS said do not exist or point nowhere.';
