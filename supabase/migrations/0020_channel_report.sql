-- Which door brought the customers who actually did something.
--
-- `0012` put `source` on every account and the doors have written it since;
-- nothing has ever read it. `docs/LAUNCH.md` is blunt about what that costs:
-- *"without it no channel can be judged"* — and the GTM plan's entire operating
-- decision is where to spend more.
--
-- ## Why this is one function rather than a page
--
-- The question is the founder's, not a customer's. A page would need an admin
-- allow-list, which is a new authorisation surface on a product that already
-- has two, for a report one person reads. This is service-role only and is read
-- by `stage0/src/gtm/channels.py`, which is where every other measurement in
-- this project lives.
--
-- ## It counts what happened, not what arrived
--
-- Sign-ups by channel is the number that flatters every channel equally. The
-- columns that decide anything are the ones after it: how many of those
-- workspaces ran a search at all, how many spent a credit, and how much. A door
-- that produces twenty sign-ups and no searches is a door producing nothing,
-- and the only way to see that is to put the columns side by side.
--
-- `null` source is its own row rather than being dropped: an account nobody can
-- attribute is a real account, and hiding it would make every percentage below
-- it wrong.

create or replace function public.channel_report ()
returns table (
  source          text,
  workspaces      bigint,
  -- Workspaces that got as far as running one search.
  searched        bigint,
  -- Workspaces that spent at least one credit on a match.
  spent           bigint,
  -- Credits spent, in milli. The ledger's own unit; `ledger.ts` formats it.
  milli_spent     bigint,
  -- Workspaces on something other than the free plan.
  paid            bigint,
  first_seen      timestamptz,
  last_seen       timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    coalesce(a.source, '(none)')                                    as source,
    count(*)                                                        as workspaces,
    count(*) filter (where r.runs > 0)                              as searched,
    count(*) filter (where l.milli > 0)                             as spent,
    coalesce(sum(l.milli), 0)::bigint                               as milli_spent,
    count(*) filter (where a.plan_id is distinct from 'free')        as paid,
    min(a.created_at)                                               as first_seen,
    max(a.created_at)                                               as last_seen
  from public.accounts a
  left join lateral (
    select count(*) as runs from public.runs r where r.account_id = a.id
  ) r on true
  left join lateral (
    select coalesce(sum(le.milli), 0) as milli
      from public.ledger_entries le
     where le.account_id = a.id and le.kind = 'match'
  ) l on true
  where a.closed_at is null
  group by coalesce(a.source, '(none)')
  order by count(*) desc, coalesce(a.source, '(none)');
$$;

revoke all on function public.channel_report () from public, anon, authenticated;
grant execute on function public.channel_report () to service_role;

/**
 * Shared links, and whether anybody opened them.
 *
 * The referral loop's own number. A share that is never opened is a button
 * somebody pressed; a share that is opened and converts is a channel.
 *
 * Grouped by workspace rather than listed by token: the tokens are
 * capabilities, and a report that prints them is a report that leaks them into
 * a terminal's scrollback.
 */
create or replace function public.share_report ()
returns table (
  account_id uuid,
  links      bigint,
  live       bigint,
  views      bigint,
  -- Workspaces that signed up through one of this account's links. `source` is
  -- written as `share/<token>` by the shared-list page.
  signups    bigint
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    s.account_id,
    count(*)                                          as links,
    count(*) filter (where s.revoked_at is null)      as live,
    coalesce(sum(s.views), 0)::bigint                 as views,
    coalesce(sum(
      (select count(*) from public.accounts a
        where a.source = 'share/' || s.token)
    ), 0)::bigint                                     as signups
  from public.shared_lists s
  group by s.account_id
  order by coalesce(sum(s.views), 0) desc;
$$;

revoke all on function public.share_report () from public, anon, authenticated;
grant execute on function public.share_report () to service_role;
