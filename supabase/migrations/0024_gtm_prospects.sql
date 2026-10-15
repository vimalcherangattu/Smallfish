-- Small Fish's own prospects (GTM, outreach A1).
--
-- The first buyers are marketing agencies that already serve a local trade.
-- `src/lib/prospecting.ts` finds them with the engine itself: Overture's agency
-- categories for a city, each agency's site read politely, and
-- `src/lib/prospects.ts` deciding which trades it says it serves.
--
-- One row per agency domain, so a second sweep of the same city reads nothing
-- twice. A site that names no trade is still stored, as `no_niche`, for the
-- same reason.
--
-- `status` is the outreach life of the row and only ever moves forward:
--
--   found      read, has a niche and an address, not yet drafted
--   no_niche   read, names no trade strongly enough to write about
--   no_email   has a niche, published no address we would write to
--   unread     the site could not be read (theirs or ours; `outcome` says)
--   drafted    a sequence is written and waiting for review
--   queued     pushed to the sending tool
--   replied / booked / suppressed / rejected
--
-- Service role only. There is no policy, so with RLS on nobody else reads it:
-- these are people we intend to email, and that list is not public.

create table if not exists public.gtm_prospects (
  id            uuid primary key default gen_random_uuid(),
  domain        text not null unique,
  name          text,
  site          text not null,
  city          text,
  state         text,
  phone         text,
  email         text,
  email_page    text,
  niches        jsonb not null default '[]'::jsonb,
  niche         text,
  niche_quote   text,
  outcome       text,
  pages         int not null default 0,
  status        text not null default 'found',
  list_token    text unique,
  source        text not null default 'overture',
  read_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists gtm_prospects_status_idx on public.gtm_prospects (status, niche);
create index if not exists gtm_prospects_city_idx on public.gtm_prospects (city, state);

alter table public.gtm_prospects enable row level security;
