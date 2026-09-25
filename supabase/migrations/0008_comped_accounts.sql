-- Small Fish · comped accounts, for end-to-end testing with real usage
--
-- A handful of people need to use the product without a balance stopping them:
-- design partners, and us, testing the whole chain against live keys. The
-- obvious implementation is to grant them a million credits, and it is wrong
-- for a reason worth writing down.
--
-- **A large grant is indistinguishable from revenue.** It is a `grant` line in
-- the same ledger, in the same units, and every report built on that ledger —
-- cost per credit, credits outstanding, what a cohort consumed — silently
-- includes it. The number that would be wrong is the one Stage 2's gate is
-- measured on. Worse, it expires: `renew_period` caps rollover at one
-- allowance, so a comped account quietly stops being comped at the end of the
-- month and a design partner hits a wall mid-test with no explanation.
--
-- So comping is a **property of the account**, not a number in the ledger:
--
--   1. `comped_until` is a date, not a flag. An unlimited account with no end
--      is how a test account survives into the revenue figures a year later.
--      It lapses by default and has to be renewed deliberately.
--   2. A comped charge still writes a ledger line, at **zero**, saying what it
--      would have cost. Free usage that leaves no trace is usage nobody can
--      audit — and "how much did the design partners actually consume" is a
--      real question with a real answer only if the lines exist.
--   3. The unlock is still recorded, so the rest of the product behaves
--      identically. A comped account that took a different path through
--      `charge_for_match` would be testing a code path no customer runs, which
--      is the opposite of what it is for.
--   4. The read allowance is lifted too. Credits deplete on matches, so a
--      criterion that matches nothing never touches the balance and the read
--      cap is the only bound on it — an unlimited account that stops at 220
--      reads is not unlimited in the way that matters.
--
-- **This spends real money.** Every read is ours to pay for at a measured
-- $0.0168, and a comped account has nothing to stop it. `comped_read_budget`
-- exists so that "unlimited to the user" does not mean "unbounded to us": it is
-- a ceiling per period, generous by default, and the account is told when it
-- is reached rather than being cut off silently.

alter table public.accounts
  add column comped_until timestamptz,
  -- Reads a comped account may spend in a period. Not a credit limit — the
  -- point is that credits do not bind them — a cost limit. At $0.0168 a read
  -- the default is about $84 a period, per account.
  add column comped_read_budget integer not null default 5000
    check (comped_read_budget >= 0);

comment on column public.accounts.comped_until is
  'While in the future, matches cost this account nothing and the read allowance '
  'is replaced by comped_read_budget. Charges are still recorded, at zero.';

create index accounts_comped_idx on public.accounts (comped_until)
  where comped_until is not null;

-- ------------------------------------------------------------- the charge --

-- As 0001, with one branch. Everything else about it is unchanged on purpose:
-- the row lock, the already-unlocked refusal and the settled cost all behave
-- the same, so a comped account exercises the code a paying one runs.
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
  v_comped  boolean;
begin
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

  select (a.comped_until is not null and a.comped_until > now())
    into v_comped
  from public.accounts a where a.id = p_account;

  if v_comped then
    -- Zero, and the line says what it would have cost. The ledger stays a
    -- complete record of what this workspace took; it just records that this
    -- one was on us. Reports that sum `milli` are unaffected, which is the
    -- whole reason this is not a large grant.
    insert into public.ledger_entries (account_id, kind, milli, business_id, why)
    values (
      p_account, 'match', 0, p_business,
      'Comped test account — no charge. Would have cost '
        || round(p_cost_milli / 1000.0, 2) || ' credits. ' || p_why
    );

    insert into public.unlocks (account_id, business_id)
    values (p_account, p_business);

    return query select true, null::text, 0::bigint;
    return;
  end if;

  -- `le.` is load-bearing: `milli` is also an OUT parameter of this function,
  -- so an unqualified `sum(milli)` is ambiguous and raises 42702.
  select coalesce(sum(le.milli), 0) into v_balance
  from public.ledger_entries le where le.account_id = p_account;

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

-- --------------------------------------------------------------- the reads --

-- As 0003 — including the clamp-before-update that the comment there explains
-- at length — with the allowance swapped for the comped budget.
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
  v_cap integer;
begin
  select a.reads_this_period,
         case
           when a.comped_until is not null and a.comped_until > now()
             then a.comped_read_budget
           else p_allowance
         end
    into v_used, v_cap
  from public.accounts a where a.id = p_account for update;

  if not found then
    return 0;
  end if;

  -- Still a clamp, and still computed before the update. A comped account has
  -- a bigger ceiling, not no ceiling: reads cost us $0.0168 each whoever is
  -- doing them, and "unlimited" with no cost bound is how a test account
  -- spends a month's budget in an afternoon.
  v_allowed := least(greatest(p_reads, 0), greatest(v_cap - v_used, 0));

  update public.accounts a
  set reads_this_period = a.reads_this_period + v_allowed
  where a.id = p_account;

  return v_allowed;
end;
$$;

-- ------------------------------------------------------------- granting it --

-- Deliberately an RPC rather than a row anybody can UPDATE, so that comping an
-- account is one call that can be found in the logs, and so that the default
-- end date is decided in one place rather than by whoever wrote the UPDATE.
--
-- `p_days` is capped at a year. An accidental `p_days => 36500` is an account
-- that is free until 2126 and that nobody will ever notice.
create or replace function public.comp_account (
  p_account uuid,
  p_days integer default 90,
  p_read_budget integer default null
)
returns table (account_id uuid, comped_until timestamptz, read_budget integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 90), 0), 365);
begin
  return query
  update public.accounts a
  set comped_until = case when v_days = 0 then null else now() + (v_days || ' days')::interval end,
      comped_read_budget = coalesce(p_read_budget, a.comped_read_budget)
  where a.id = p_account
  returning a.id, a.comped_until, a.comped_read_budget;
end;
$$;

-- `p_days => 0` removes it, which is why there is no separate uncomp function
-- to forget to call.

revoke all on function public.comp_account (uuid, integer, integer) from public, anon, authenticated;
revoke all on function public.charge_for_match (uuid, text, bigint, text) from public, anon, authenticated;
revoke all on function public.spend_reads (uuid, integer, integer) from public, anon, authenticated;
