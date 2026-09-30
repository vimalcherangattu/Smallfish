-- Who the two-day nudge is for, and — more importantly — who it is not for.
--
-- The flow document specifies a note two days after sign-up to somebody who has
-- not taken a single row. `mail.ts` writes it and `mail_sends` makes it send
-- once. What was missing is the question this answers: **which workspaces**.
--
-- ## Every condition here is a way of not sending it
--
-- A nudge that arrives after the person already did the thing is the clearest
-- possible signal that nobody is reading their account, and it is the most
-- common way a drip sequence makes a product feel automated in the bad sense.
-- So:
--
--   - **Nothing spent.** A workspace that has unlocked a single business has
--     done the thing the nudge asks for.
--   - **Old enough.** Two days, not two hours. Somebody who signed up this
--     morning has not failed to do anything yet.
--   - **Not too old.** Past a week it is not a nudge, it is a product emailing
--     a stranger about an account they have forgotten. The window closes.
--   - **Not already nudged**, which `claim_mail` enforces separately and
--     absolutely; this only avoids selecting them.
--   - **Not closed**, and **not comped** — a comped workspace is somebody we
--     gave credits to on purpose, usually while talking to them, and a drip
--     email in the middle of that conversation is worse than silence.
--
-- ## It returns what the message needs, so the caller makes no second query
--
-- `first_query` is what the door promised and what the note links back to;
-- `credits` is what they have not spent. Both come from the row that decided
-- they should be written to, so the message cannot describe a different
-- workspace from the one selected.

create or replace function public.nudge_candidates (
  p_after_hours integer default 48,
  p_before_hours integer default 168,
  p_limit integer default 200
)
returns table (
  account_id  uuid,
  clerk_user  text,
  first_query text,
  source      text,
  milli       bigint
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    a.id                                            as account_id,
    -- The address lives in Clerk, not here: this product stores no customer
    -- email of its own, deliberately, so there is one copy and it is the one
    -- the person can change. The caller resolves it.
    (select m.user_id from public.account_members m
      where m.account_id = a.id order by m.added_at limit 1) as clerk_user,
    a.first_query,
    a.source,
    coalesce(b.milli, 0)::bigint                    as milli
  from public.accounts a
  left join public.account_balances b on b.account_id = a.id
  where a.closed_at is null
    and (a.comped_until is null or a.comped_until < now())
    and a.created_at < now() - make_interval(hours => greatest(p_after_hours, 1))
    and a.created_at > now() - make_interval(hours => greatest(p_before_hours, 2))
    -- Nothing taken. One unlocked business means the nudge has no question to
    -- ask, and asking it anyway is the defect this whole function is shaped
    -- around.
    and not exists (
      select 1 from public.ledger_entries le
       where le.account_id = a.id and le.kind in ('match', 'no_website_unlock')
    )
    and not exists (
      select 1 from public.mail_sends ms
       where ms.account_id = a.id and ms.kind = 'nudge'
    )
  order by a.created_at
  limit greatest(p_limit, 1);
$$;

revoke all on function public.nudge_candidates (integer, integer, integer) from public, anon, authenticated;
grant execute on function public.nudge_candidates (integer, integer, integer) to service_role;
