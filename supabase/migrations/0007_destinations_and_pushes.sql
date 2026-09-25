-- Small Fish · CRM and sender destinations, and a receipt for every row pushed (S2-02)
--
-- Two tables and a view, and each exists for a reason that is not "we need
-- somewhere to put this".
--
--   1. `destinations` is the connection a customer made. Readable by their
--      workspace; writable by nobody from a client, the same way the billing
--      tables work.
--   2. `destination_secrets` holds the credential, in its own table **with no
--      policy at all** — not even a read policy for the owner. A customer
--      cannot retrieve their own HubSpot token back out of us, and neither can
--      a bug in a select. It is AES-GCM ciphertext either way (see
--      `deliver.ts`), so this is the second lock rather than the only one.
--   3. `pushes` is a receipt per (destination, business). It makes a re-push an
--      update rather than a duplicate, and it is what makes the honest answer
--      to an opt-out possible — see the view at the bottom.
--
-- Separating the secret from the connection is the part worth defending. The
-- connect screen, the destination list and the push summary all read
-- `destinations`; none of them needs the token. A single table would mean every
-- one of those reads selects a column holding a credential that can write to
-- the customer's CRM, and the first `select *` is the accident.

-- ------------------------------------------------------------ connections --

create table public.destinations (
  id          uuid primary key default gen_random_uuid(),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  kind        text not null check (kind in ('hubspot', 'instantly', 'smartlead', 'webhook')),
  name        text not null default '',
  -- A campaign id for a sequencer, an https endpoint for a webhook, null for
  -- HubSpot, which needs neither.
  target      text,
  -- The last four characters of the credential, so a customer can tell which
  -- key is connected. Never the credential.
  secret_hint text not null default '',
  created_at  timestamptz not null default now(),
  disabled_at timestamptz
);

create index destinations_account_idx on public.destinations (account_id)
  where disabled_at is null;

create table public.destination_secrets (
  destination_id uuid primary key
    references public.destinations (id) on delete cascade,
  -- `v1.<iv>.<tag>.<ciphertext>`, AES-256-GCM, keyed by INTEGRATION_SECRET_KEY
  -- in the environment. The version prefix is what will make rotation possible
  -- without guessing at the shape of old rows.
  cipher     text not null check (cipher like 'v1.%'),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- receipts --

-- One row per business per destination, ever.
--
-- The primary key is doing the same job it does in `unlocks`: it turns "don't
-- create the same company twice" from a thing the application remembers into a
-- thing the database enforces. `times` counts deliberate re-pushes, which are a
-- normal thing to do — the customer's CRM ate the first one, or the evidence
-- changed — and `first_pushed_at` is what lets an export say `new_to_you`.
create table public.pushes (
  account_id     uuid not null references public.accounts (id) on delete cascade,
  destination_id uuid not null references public.destinations (id) on delete cascade,
  business_id    text not null,
  -- The id the destination gave the record, when it gave one. This is the only
  -- reason the view below can tell a customer *which* record to delete.
  external_id    text,
  first_pushed_at timestamptz not null default now(),
  last_pushed_at  timestamptz not null default now(),
  times          integer not null default 1 check (times > 0),
  primary key (account_id, destination_id, business_id)
);

create index pushes_business_idx on public.pushes (business_id);

-- --------------------------------------------- the honest answer to S1-09 --

-- `suppression.ts` tells a business owner the truth: rows already exported are
-- in someone's spreadsheet and cannot be recalled. That is still true. But a
-- row pushed into a CRM is different in one useful way — **we know the record
-- id**, so "we cannot recall it" can become "here are the seven records in your
-- HubSpot to delete, with their ids".
--
-- That is the whole point of keeping `external_id`. The seven-day promise in
-- `suppression.ts` is about our own index; this is what lets a customer keep
-- the promise on their side, and it is the difference between a policy and an
-- apology.
--
-- `security_invoker` is set, and 0006 is why: without it this view would run as
-- its owner and hand every workspace's pushes to anyone with the publishable
-- key. That mistake has already been made once in this schema.
create view public.pushed_then_suppressed
  with (security_invoker = true)
as
  select p.account_id,
         p.destination_id,
         d.kind    as destination_kind,
         d.name    as destination_name,
         p.business_id,
         p.external_id,
         p.last_pushed_at,
         s.requested_at,
         s.remove_by
  from public.pushes p
  join public.destinations d on d.id = p.destination_id
  join public.suppressions s on s.business_id = p.business_id;

-- -------------------------------------------------------------------- RLS --

alter table public.destinations        enable row level security;
alter table public.destination_secrets enable row level security;
alter table public.pushes              enable row level security;

create policy destinations_read on public.destinations
  for select using (public.member_of (account_id));

create policy pushes_read on public.pushes
  for select using (public.member_of (account_id));

-- `destination_secrets` gets no policy. Not a restrictive one — none. Reads and
-- writes both need the service role, which means server code, which means the
-- credential is only ever decrypted in a route handler that is about to use it.

revoke insert, update, delete on public.destinations from anon, authenticated;
revoke insert, update, delete on public.pushes       from anon, authenticated;
revoke all on public.destination_secrets from anon, authenticated;
revoke all on public.pushed_then_suppressed from anon;
grant select on public.pushed_then_suppressed to authenticated;

-- ----------------------------------------------------------- the receipt --

-- Record a push. Upsert, because a second push of the same row is normal and
-- must not be an error — it is an update in the customer's CRM, so it is an
-- update here.
create or replace function public.record_push (
  p_account uuid,
  p_destination uuid,
  p_business text,
  p_external text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.pushes (account_id, destination_id, business_id, external_id)
  values (p_account, p_destination, p_business, p_external)
  on conflict (account_id, destination_id, business_id) do update
    set last_pushed_at = now(),
        times          = public.pushes.times + 1,
        -- Keep the id we already have if this delivery did not return one:
        -- losing it would cost the customer the only thing that makes the
        -- opt-out view actionable.
        external_id    = coalesce(excluded.external_id, public.pushes.external_id);
$$;

revoke all on function public.record_push (uuid, uuid, text, text) from public, anon, authenticated;
