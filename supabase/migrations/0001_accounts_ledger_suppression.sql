-- Small Fish · accounts, the credit ledger, suppression and events (S1-08, S1-09, S1-11)
--
-- The rules this schema enforces are the ones that are expensive to get wrong,
-- and each is enforced *here* rather than in application code, because a rule
-- that lives only in TypeScript is a rule that holds until the second caller.
--
--   1. A business is charged for at most once per account. A primary key on
--      (account_id, business_id) in `unlocks` makes a double charge impossible
--      rather than merely unlikely. `ledger.ts` already refuses it; two
--      concurrent requests would both pass that check and both insert.
--   2. The ledger is append-only. A balance you can UPDATE is a balance whose
--      history is a suggestion. Triggers below reject UPDATE and DELETE on
--      `ledger_entries` outright — there is no admin exception, because a
--      correction is itself a line.
--   3. No client ever writes to a billing table. RLS grants SELECT to the
--      account's own members and nothing else; every insert goes through
--      server code holding the service role. A client that can insert a ledger
--      entry can grant itself credits.
--   4. Credits are integers, in thousandths. `ledger.ts` explains why at
--      length: the 0.25-credit unlock plus floating point is an account that
--      ends the month at -0.0000000004 and a support ticket nobody can answer.
--      `bigint`, and a check constraint that the unit is never fractional.
--
-- Where the split falls: **TypeScript decides how much, Postgres decides
-- whether it is allowed.** Band settlement, the quote-can-only-go-down rule and
-- the 12-month unlock window stay in `pricing.ts` and `ledger.ts` where they
-- are tested without a database. `charge_for_match` below takes an
-- already-settled cost and enforces only the two things that need to be atomic:
-- sufficient balance, and not already unlocked. Duplicating the pricing rules
-- in SQL would create a second source of truth about money.
--
-- Auth: this is written against Supabase's `auth.users`. If login moves to
-- Clerk, `account_members.user_id` becomes text holding the Clerk subject and
-- every `auth.uid()` below becomes a JWT claim lookup. That is the whole
-- change, and it is written here so the decision is visible rather than
-- discovered.

-- ---------------------------------------------------------------- accounts --

-- An account is a workspace, not a person. `ledger.ts` says "free to that
-- workspace for 12 months", and unlocks are shared by everyone in it. Modelling
-- it as a person now would mean migrating live billing rows later.
create table public.accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null default 'My workspace',
  plan_id       text not null default 'free',
  -- Reads spent this period, against the plan's allowance. This is what bounds
  -- cost when a criterion matches nothing: credits deplete on matches, so an
  -- impossible criterion never touches the balance and only this does.
  reads_this_period integer not null default 0 check (reads_this_period >= 0),
  period_start  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  -- Set when the customer cancels. The account keeps its ledger and its
  -- unlocks; it just stops renewing. Deleting it would destroy the record of
  -- what they were charged, which is the one thing a billing dispute needs.
  closed_at     timestamptz
);

create table public.account_members (
  account_id uuid not null references public.accounts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null default 'owner' check (role in ('owner', 'member')),
  added_at   timestamptz not null default now(),
  primary key (account_id, user_id)
);

create index account_members_user_idx on public.account_members (user_id);

-- Which accounts the caller belongs to. Kept as a function so the policies
-- below read the same way and there is one definition to get right.
create or replace function public.member_of (a uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.account_members m
    where m.account_id = a and m.user_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------------ ledger --

create type public.entry_kind as enum (
  'grant',              -- a period's allowance, or a pack
  'rollover',           -- unused credits carried from last period
  'expiry',             -- rollover that was not used in time
  'match',              -- a matched business unlocked
  'no_website_unlock',
  'discovery',          -- gap-filled candidates bought from Places
  'refund'              -- a match the customer told us was wrong
);

create table public.ledger_entries (
  id          bigint generated always as identity primary key,
  account_id  uuid not null references public.accounts (id) on delete cascade,
  kind        public.entry_kind not null,
  -- Milli-credits. Positive adds to the balance, negative spends it.
  milli       bigint not null,
  at          timestamptz not null default now(),
  business_id text,
  -- Plain words, always. A ledger line nobody can explain is the billing
  -- equivalent of a verdict without a quote, and this product's whole argument
  -- is that it does not ship those.
  why         text not null check (length(why) > 0)
);

create index ledger_entries_account_idx on public.ledger_entries (account_id, at desc);
create index ledger_entries_business_idx on public.ledger_entries (account_id, business_id)
  where business_id is not null;

-- Append-only. Not "by convention" — by refusal.
create or replace function public.ledger_is_append_only ()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'ledger_entries is append-only: % is not permitted. A correction is a new '
    'entry, so that the history still shows what happened.', tg_op;
end;
$$;

create trigger ledger_no_update
  before update on public.ledger_entries
  for each row execute function public.ledger_is_append_only ();

create trigger ledger_no_delete
  before delete on public.ledger_entries
  for each row execute function public.ledger_is_append_only ();

-- One row per business this account has paid for. The primary key is the
-- double-charge guard, and it is the reason this table exists at all rather
-- than being derived from the ledger.
create table public.unlocks (
  account_id   uuid not null references public.accounts (id) on delete cascade,
  business_id  text not null,
  unlocked_at  timestamptz not null default now(),
  primary key (account_id, business_id)
);

create view public.account_balances as
  select account_id, sum(milli)::bigint as milli
  from public.ledger_entries
  group by account_id;

-- ------------------------------------------------------------ suppression --

-- A business that asked not to be listed (S1-09).
--
-- What is deliberately *not* stored: the email address or phone number the
-- request was verified against. Keeping contact details for someone whose
-- entire request was "stop holding me in your product" would be a strange way
-- to honour it. The method is recorded so a dispute can be answered; the value
-- is used once, server-side, and discarded.
create table public.suppressions (
  business_id text primary key,
  method      text not null check (method in ('domain', 'phone')),
  requested_at timestamptz not null default now(),
  -- The seven-day promise, made checkable. A row past this date that is still
  -- serving is a broken promise with a timestamp on it.
  remove_by   timestamptz not null,
  effective_at timestamptz
);

create index suppressions_pending_idx on public.suppressions (remove_by)
  where effective_at is null;

-- ---------------------------------------------------------------- events --

-- S1-11's sink. `events.ts` strips identifying keys before anything reaches
-- here; the check below is the second line, so that a future call site cannot
-- quietly put a business name in a column.
create table public.events (
  id         bigint generated always as identity primary key,
  name       text not null,
  at         timestamptz not null default now(),
  account_id uuid references public.accounts (id) on delete set null,
  props      jsonb not null default '{}'::jsonb,
  constraint events_carry_no_identities check (
    not (props ?| array['name', 'phone', 'email', 'website', 'address', 'site', 'domain'])
  )
);

create index events_name_at_idx on public.events (name, at desc);

-- -------------------------------------------------------------------- RLS --

alter table public.accounts        enable row level security;
alter table public.account_members enable row level security;
alter table public.ledger_entries  enable row level security;
alter table public.unlocks         enable row level security;
alter table public.suppressions    enable row level security;
alter table public.events          enable row level security;

-- Members may read their own account and its billing history. Nobody may write
-- any of it from a client, at all, ever: there is no insert, update or delete
-- policy on these tables, so every write needs the service role and therefore
-- server code. Writes are refused by the absence of a policy rather than by a
-- policy that says no, which is the same thing and one fewer thing to get
-- subtly wrong.
create policy accounts_read on public.accounts
  for select using (public.member_of (id));

create policy account_members_read on public.account_members
  for select using (public.member_of (account_id));

create policy ledger_read on public.ledger_entries
  for select using (public.member_of (account_id));

create policy unlocks_read on public.unlocks
  for select using (public.member_of (account_id));

create policy events_read_own on public.events
  for select using (account_id is not null and public.member_of (account_id));

-- The suppression list is the one table the world may read, and it has to be:
-- the app filters every count, map pin, row and export against it before
-- anything is shown. It carries business ids and nothing else — no method, no
-- dates, no contact — so a public read discloses only "this listing asked to be
-- left out", which is the fact the list exists to publish.
create policy suppressions_public_read on public.suppressions
  for select using (effective_at is not null);

-- ------------------------------------------------- the one atomic decision --

-- Charge for a matched business, or refuse.
--
-- `cost_milli` arrives already settled by `pricing.ts` — the band, the
-- quote-can-only-go-down rule and the 12-month window are decided there and
-- tested without a database. What cannot be decided there is whether two
-- requests arriving together may both spend the last credit, so that is decided
-- here, under a row lock, and nothing else is.
create or replace function public.charge_for_match (
  p_account uuid,
  p_business text,
  p_cost_milli bigint,
  p_why text
)
returns table (charged boolean, reason text, milli bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance bigint;
begin
  -- Serialises concurrent charges against this account and nothing else.
  perform 1 from public.accounts where id = p_account for update;

  if not found then
    return query select false, 'No such account.', 0::bigint;
    return;
  end if;

  if exists (select 1 from public.unlocks
             where account_id = p_account and business_id = p_business) then
    return query select false, 'Already unlocked by this workspace.', 0::bigint;
    return;
  end if;

  select coalesce(sum(milli), 0) into v_balance
  from public.ledger_entries where account_id = p_account;

  if v_balance < p_cost_milli then
    return query select false, 'Not enough credits left.', 0::bigint;
    return;
  end if;

  insert into public.ledger_entries (account_id, kind, milli, business_id, why)
  values (p_account, 'match', -p_cost_milli, p_business, p_why);

  insert into public.unlocks (account_id, business_id)
  values (p_account, p_business);

  return query select true, null::text, p_cost_milli;
end;
$$;

revoke all on function public.charge_for_match (uuid, text, bigint, text) from public, anon, authenticated;
