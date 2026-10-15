-- Everything that happens to a prospect, in order (GTM, outreach tracking).
--
-- One row per event, from three places:
--   our own code   found, prepared, queued, visited (/hi), list_built,
--                  auto_replied, suppressed
--   Instantly      its webhook events, as it names them: email_sent,
--                  reply_received, email_bounced, lead_unsubscribed,
--                  lead_interested, lead_out_of_office, ...
--   the product    signed_up and paid, joined on `accounts.source`, which a
--                  prospect's link sets to `outreach/<list_token>`
--
-- The funnel on /ops/outreach is counted from here, so a number on that page
-- is always a count of rows somebody can open.
--
-- `detail` carries what the event needs and no more: a reply's text is kept
-- because answering it is the point, and it is the prospect writing to us.

create table if not exists public.gtm_events (
  id          bigint generated always as identity primary key,
  domain      text,
  email       text,
  kind        text not null,
  detail      jsonb not null default '{}'::jsonb,
  at          timestamptz not null default now()
);

create index if not exists gtm_events_domain_idx on public.gtm_events (domain, at);
create index if not exists gtm_events_kind_idx on public.gtm_events (kind, at);

alter table public.gtm_events enable row level security;

-- Addresses that asked us to stop, whatever the channel. Checked before every
-- queue, and pushed to Instantly's block list as well.
create table if not exists public.gtm_suppressed (
  value       text primary key,          -- an address or a bare domain
  why         text not null,
  at          timestamptz not null default now()
);

alter table public.gtm_suppressed enable row level security;
