-- The free list each prospect's email links to (GTM, outreach A2).
--
-- `prepareList` in `src/lib/prospecting.ts` runs the agency's niche in its own
-- city through the engine (the same readSite and judge a customer's job uses)
-- until three businesses match, and keeps what `/hi/[token]` shows:
--
--   list_query     the search, in words, handed to the app on sign-up
--   list_listings  how many of that trade the city has
--   list_readable  how many of those have a website we can read
--   list_read      how many we opened to find the three
--   list_rows      the three: name, site, phone, and the proof sentence.
--                  Our verdict and evidence only, never a page copy.
--   list_at        when, so a stale preview can be refreshed rather than shown

alter table public.gtm_prospects
  add column if not exists list_query text,
  add column if not exists list_listings int,
  add column if not exists list_readable int,
  add column if not exists list_read int,
  add column if not exists list_rows jsonb,
  add column if not exists list_at timestamptz;
