-- The ledger's other three writes, each atomic for a reason (S1-08).
--
-- Same split as `charge_for_match` in 0001: TypeScript decides how much,
-- Postgres decides whether it is allowed. Every amount here arrives already
-- computed by `pricing.ts` and `ledger.ts`; what is added is a row lock and a
-- uniqueness rule.
--
-- ## What running these found
--
-- `spend_reads` shipped, in its first version below, returning the number of
-- reads *asked for* rather than the number permitted — so an account already at
-- its allowance was told it could read 30 more. That is the cost bound failing
-- open, and it is the bound that matters most: credits deplete on matches, so a
-- criterion matching nothing never touches the balance, and the read allowance
-- is the only thing between an impossible search and an unbounded bill.
--
-- The cause was arithmetic inside a RETURNING clause, where `reads_this_period`
-- is the value *after* the update. Subtracting the requested figure does not
-- recover the value before it once clamping has occurred, so the clamp was
-- invisible to the caller. The version here computes the permitted figure
-- before the update. Verified: 30 of 44, then 14, then 0.

create or replace function public.refund_match (
  p_account uuid,
  p_business text
)
returns table (refunded boolean, reason text, milli bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_charged bigint;
begin
  perform 1 from public.accounts where id = p_account for update;
  if not found then
    return query select false, 'No such account.', 0::bigint;
    return;
  end if;

  if exists (select 1 from public.ledger_entries le
             where le.account_id = p_account
               and le.business_id = p_business
               and le.kind = 'refund') then
    return query select false, 'Already refunded.', 0::bigint;
    return;
  end if;

  -- From the ledger line that charged it, never recomputed. The band may have
  -- settled differently at the time, and refunding a recomputed number leaves
  -- a customer a quarter-credit short with nobody able to say why.
  select le.milli into v_charged
  from public.ledger_entries le
  where le.account_id = p_account
    and le.business_id = p_business
    and le.kind in ('match', 'no_website_unlock')
  order by le.at asc
  limit 1;

  if v_charged is null then
    return query select false, 'Nothing was charged for this.', 0::bigint;
    return;
  end if;

  insert into public.ledger_entries (account_id, kind, milli, business_id, why)
  values (p_account, 'refund', -v_charged, p_business,
          'You told us this match was wrong, so it costs nothing.');

  -- The unlock goes too: the customer is not holding a row they did not pay
  -- for, and a later genuine match on the same business can be charged again.
  -- Verified: after a refund, the same business charges cleanly a second time.
  delete from public.unlocks u
  where u.account_id = p_account and u.business_id = p_business;

  return query select true, null::text, -v_charged;
end;
$$;

-- Start a new billing period.
--
-- `p_allowance_milli` is the plan's credits, from `pricing.ts`. Rollover is
-- capped at one period's allowance, so a dormant account cannot bank a balance
-- it could spend at once — the read allowance behind those credits is what
-- actually costs us, and it is granted per period rather than accumulated.
--
-- A full period therefore ends at *twice* the allowance at most: one month
-- carried plus this month's grant. That is the intended ceiling and matches
-- `renew()` in `ledger.ts` exactly.
create or replace function public.renew_period (
  p_account uuid,
  p_allowance_milli bigint,
  p_plan_name text
)
returns table (carried bigint, expired bigint, granted bigint)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_balance bigint;
  v_carried bigint;
  v_lost bigint;
begin
  perform 1 from public.accounts where id = p_account for update;
  if not found then
    raise exception 'No account %', p_account;
  end if;

  select coalesce(sum(le.milli), 0) into v_balance
  from public.ledger_entries le where le.account_id = p_account;

  v_carried := greatest(0, least(v_balance, p_allowance_milli));
  v_lost := greatest(0, v_balance - p_allowance_milli);

  if v_lost > 0 then
    insert into public.ledger_entries (account_id, kind, milli, why)
    values (p_account, 'expiry', -v_lost,
            format('%s credits expired. Unused credits carry one month and are capped at one month''s allowance.',
                   round(v_lost / 1000.0, 2)));
  end if;

  if v_carried > 0 then
    insert into public.ledger_entries (account_id, kind, milli, why)
    values (p_account, 'rollover', 0,
            format('%s credits carried over.', round(v_carried / 1000.0, 2)));
  end if;

  insert into public.ledger_entries (account_id, kind, milli, why)
  values (p_account, 'grant', p_allowance_milli,
          format('%s: %s credits for the period.', p_plan_name,
                 round(p_allowance_milli / 1000.0, 2)));

  update public.accounts
  set reads_this_period = 0, period_start = now()
  where id = p_account;

  return query select v_carried, v_lost, p_allowance_milli;
end;
$$;

-- Record reading, and return how many reads were actually permitted.
--
-- See the note at the top of this file. The permitted figure is computed
-- before the update, under the same row lock the other ledger writes take,
-- because two scans running at once would otherwise both read the counter and
-- both proceed.
create or replace function public.spend_reads (
  p_account uuid,
  p_reads integer,
  p_allowance integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_used integer;
  v_allowed integer;
begin
  select a.reads_this_period into v_used
  from public.accounts a where a.id = p_account for update;

  if not found then
    return 0;
  end if;

  v_allowed := least(greatest(p_reads, 0), greatest(p_allowance - v_used, 0));

  update public.accounts a
  set reads_this_period = a.reads_this_period + v_allowed
  where a.id = p_account;

  return v_allowed;
end;
$$;

revoke all on function public.refund_match (uuid, text) from public, anon, authenticated;
revoke all on function public.renew_period (uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.spend_reads (uuid, integer, integer) from public, anon, authenticated;
