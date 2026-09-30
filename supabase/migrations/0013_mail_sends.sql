-- One record of every message this product sends a customer, and the claim that
-- stops it sending twice.
--
-- Four messages are specified: the welcome, the finished-read note, the
-- 48-hour nudge and the Monday digest. Three of them fire from a scheduler,
-- which means they fire again when a tick is retried, when two ticks overlap,
-- or when a deploy replays a queue. **A duplicate email is only visible in
-- somebody's inbox**, which is the worst place for a defect to live, so the
-- once-only rule belongs in the database rather than in whichever route
-- remembers it.
--
-- `notify.ts` already learned this the hard way for the finished-read note,
-- where `mark_job_notified` claims before sending: the failure mode is a note
-- that is missed, not one that is duplicated, and that is the right way round
-- because a missing note is visible on the page.
--
-- The primary key is the whole mechanism. `period` is what makes one table
-- serve a once-ever message and a weekly one:
--
--   welcome   → period ''          (once per workspace, ever)
--   nudge     → period ''          (once per workspace, ever)
--   digest    → period '2026-W40'  (once per workspace per ISO week)
--
-- A `kind` this table does not know is rejected, so a typo in a route name
-- cannot quietly create a parallel stream of unclaimed mail.

create table if not exists public.mail_sends (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  kind        text not null check (kind in ('welcome', 'nudge', 'digest')),
  -- '' for a once-ever message; an ISO week for a recurring one.
  period      text not null default '',
  claimed_at  timestamptz not null default now(),
  -- Null until the provider accepts it. A row that is claimed and never sent is
  -- the deliberate cost of claiming first, and it is visible here rather than
  -- being indistinguishable from a message that went out.
  sent_at     timestamptz,
  -- Why it did not send, when it did not. Kept so that "no mail provider is
  -- configured" is a fact somebody can query rather than a log line that rolled
  -- off.
  why         text,
  primary key (account_id, kind, period)
);

comment on table public.mail_sends is
  'One row per message per workspace. The primary key is the once-only rule.';

alter table public.mail_sends enable row level security;

-- Read your own workspace's mail history; write nothing. Sending is a
-- service-role action, and a client that could insert here could suppress a
-- message by claiming it first.
-- `member_of`, not a hand-rolled subquery. The identity in this project is
-- Clerk's `sub` claim, which is text, and `account_members.user_id` is text to
-- match it; the first version of this policy compared it to `auth.uid()` and
-- was rejected by Postgres with `operator does not exist: text = uuid`. One
-- helper means the next table cannot get it wrong in a way that *parses*.
create policy mail_sends_read on public.mail_sends
  for select using (public.member_of (account_id));

revoke insert, update, delete on public.mail_sends from anon, authenticated;
revoke all on public.mail_sends from anon;
grant select on public.mail_sends to authenticated;

/**
 * Claim a message, or report that somebody already has it.
 *
 * `on conflict do nothing` plus `returning` is the whole claim: exactly one
 * caller gets a row back, whatever else is running. The alternative — select,
 * then insert — has a window between the two, and a scheduler is precisely the
 * thing that will find it.
 */
create or replace function public.claim_mail (
  p_account uuid,
  p_kind text,
  p_period text default ''
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed boolean;
begin
  insert into public.mail_sends (account_id, kind, period)
  values (p_account, p_kind, coalesce(p_period, ''))
  on conflict (account_id, kind, period) do nothing
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

revoke all on function public.claim_mail (uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_mail (uuid, text, text) to service_role;

/**
 * Record what happened to a claimed message.
 *
 * Named `record_mail`, not `settle_mail`: `test_schema.py` refuses the word
 * "settle" anywhere in the schema, because band settlement is a pricing rule
 * and `pricing.ts` owns it without a database. The lint fired on this function
 * the first time it ran, and it is right to — the previous casualty was
 * `sites_settled`, renamed to `sites_judged` for the same reason.
 *
 * Separate from the claim on purpose. The claim has to happen *before* the
 * provider is called, and the outcome is only known after, so folding them into
 * one call would mean either claiming late or recording a result that is a
 * guess.
 */
create or replace function public.record_mail (
  p_account uuid,
  p_kind text,
  p_period text default '',
  p_sent boolean default false,
  p_why text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.mail_sends
     set sent_at = case when p_sent then now() else null end,
         why     = nullif(btrim(coalesce(p_why, '')), '')
   where account_id = p_account
     and kind = p_kind
     and period = coalesce(p_period, '');
end;
$$;

revoke all on function public.record_mail (uuid, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.record_mail (uuid, text, text, boolean, text) to service_role;
