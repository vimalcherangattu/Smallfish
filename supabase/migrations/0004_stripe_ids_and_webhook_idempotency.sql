-- Stripe (S1-08), and the guard that makes a webhook safe to receive twice.
--
-- Stripe delivers at least once and retries anything that does not return 2xx
-- quickly. For most handlers a repeat is harmless. Here it is not: `invoice.paid`
-- grants a period's credits, the ledger is append-only, and a second delivery of
-- the same invoice would mint a second month of credits that nobody paid for and
-- that cannot be corrected by deletion. That is the most expensive shape of bug
-- this schema can have, so the dedupe is a primary key rather than a convention.
--
-- Keyed on Stripe's own event id (`evt_…`), claimed inside the same transaction
-- as the work it guards. Doing it from TypeScript would be two round trips with
-- a gap in the middle, and Stripe's retries are fast enough to land in that gap.

alter table public.accounts
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text;

create unique index if not exists accounts_stripe_customer_idx
  on public.accounts (stripe_customer_id)
  where stripe_customer_id is not null;

create table if not exists public.webhook_events (
  id          text primary key,
  source      text not null,
  kind        text not null,
  received_at timestamptz not null default now(),
  account_id  uuid references public.accounts (id) on delete set null,
  note        text
);

create index if not exists webhook_events_received_idx
  on public.webhook_events (received_at desc);

alter table public.webhook_events enable row level security;
-- No policy at all: only the service role writes here and nobody reads it from
-- a client. Same posture as every other billing table — writes are refused by
-- the absence of a policy rather than by a policy that says no.

-- Apply a paid period, exactly once for a given Stripe event.
--
-- `p_allowance_milli` and `p_plan_id` are decided by `pricing.ts` and passed in,
-- for the reason `charge_for_match` gives: the database must not learn what a
-- plan costs, or there are two sources of truth about money.
create or replace function public.apply_paid_period (
  p_event_id text,
  p_kind text,
  p_account uuid,
  p_plan_id text,
  p_allowance_milli bigint,
  p_plan_name text,
  p_customer text default null,
  p_subscription text default null
)
returns table (applied boolean, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.webhook_events (id, source, kind, account_id)
    values (p_event_id, 'stripe', p_kind, p_account);
  exception when unique_violation then
    return query select false, 'Already applied.';
    return;
  end;

  update public.accounts
  set plan_id = p_plan_id,
      stripe_customer_id = coalesce(p_customer, stripe_customer_id),
      stripe_subscription_id = coalesce(p_subscription, stripe_subscription_id)
  where id = p_account;

  if not found then
    raise exception 'No account %', p_account;
  end if;

  perform public.renew_period(p_account, p_allowance_milli, p_plan_name);
  return query select true, null::text;
end;
$$;

revoke all on function public.apply_paid_period (text, text, uuid, text, bigint, text, text, text)
  from public, anon, authenticated;
