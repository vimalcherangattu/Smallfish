-- One purchase, one grant — even when two different events describe it.
--
-- Found on the first live payment, a ₹2 verification charge.
-- `checkout.session.completed` and `invoice.paid` both fire for a new
-- subscription and both describe the *same* billing period, but they carry
-- different Stripe event ids. The event-id primary key in 0004 therefore let
-- both through and the purchase granted two periods. On Growth that is 400
-- credits nobody paid for, written into an append-only ledger that cannot be
-- corrected by deleting a row.
--
-- The event id was the wrong key on its own. It makes a *redelivery*
-- idempotent, which is necessary and not sufficient: what has to be unique is
-- the **period being paid for**, however many events mention it. Both keys are
-- kept, because they stop different things.
--
--   id          one Stripe event, applied once     (a redelivery)
--   period_key  one billing period, granted once   (two events, one purchase)
--
-- The key is `<subscription>:<period>` — `create` for a subscription's first
-- period, so the checkout session and its first invoice collide, and the
-- period start for every renewal after it, so each cycle grants exactly once.

alter table public.webhook_events
  add column if not exists period_key text;

create unique index if not exists webhook_events_period_idx
  on public.webhook_events (period_key)
  where period_key is not null;

create or replace function public.apply_paid_period (
  p_event_id text,
  p_kind text,
  p_account uuid,
  p_plan_id text,
  p_allowance_milli bigint,
  p_plan_name text,
  p_customer text default null,
  p_subscription text default null,
  p_period_key text default null
)
returns table (applied boolean, reason text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  begin
    insert into public.webhook_events (id, source, kind, account_id, period_key)
    values (p_event_id, 'stripe', p_kind, p_account, p_period_key);
  exception
    when unique_violation then
      -- Either key can be the one that fired. Both mean the same thing to the
      -- caller: this period is already paid for and already granted.
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

revoke all on function public.apply_paid_period (text, text, uuid, text, bigint, text, text, text, text)
  from public, anon, authenticated;

-- The old eight-argument signature would otherwise linger and stay callable,
-- and a call that omits the period key is a call that can double-grant.
drop function if exists public.apply_paid_period (text, text, uuid, text, bigint, text, text, text);
