-- What the customer did with a row, and where they told us we were wrong.
--
-- Two tables, and the second is worth more than it looks.
--
-- ## `contacted` — stops the same practice being emailed twice
--
-- The flow document's Contacted tab. A list is worked over days, from more than
-- one device, sometimes by more than one person in a workspace, and the failure
-- it prevents is small and corrosive: a dentist who gets the same opener from
-- the same agency twice concludes nobody is paying attention, which is the exact
-- opposite of what an evidence-backed opener is for.
--
-- Scoped to the workspace, not the person. Two people sharing an account are
-- working one list.
--
-- ## `match_feedback` — the refund is also the measurement
--
-- "Not a fit → refund on the spot" is the trust move: a product that charges
-- per match and argues about a bad one has no argument left. `refund_match`
-- (migration `0003`) has done the money half since the beginning and **nothing
-- has ever called it**, because until 2026-09-30 nothing charged.
--
-- The half this adds is the reason, and it is not a satisfaction survey. S0-16
-- needs hand-labelled businesses to measure precision, and the plan is explicit
-- that this "is human work and cannot be automated away". A customer saying
-- *"this one does have online booking, it is behind the Patients menu"* is
-- exactly that label, produced by the person best placed to know, at the moment
-- they care most. **Every refund is a free precision measurement**, and the only
-- reason to make it optional is that a refund must never wait on a form.

create table if not exists public.contacted (
  account_id  uuid not null references public.accounts (id) on delete cascade,
  business_id text not null,
  at          timestamptz not null default now(),
  -- 'email' | 'phone' | 'other'. Not constrained: the point is the fact, and a
  -- channel we have not thought of should not fail the write.
  channel     text,
  primary key (account_id, business_id)
);

comment on table public.contacted is
  'Businesses this workspace has reached out to. Keyed per workspace, not per user.';

create index if not exists contacted_recent_idx
  on public.contacted (account_id, at desc);

/**
 * Why a match was refunded, in the customer's words.
 *
 * `verdict_was` is what we told them, kept alongside so a row can be read
 * without re-deriving it — the market file may have been regenerated since, and
 * a label whose claim has drifted underneath it is not a label.
 */
create table if not exists public.match_feedback (
  id          uuid primary key default gen_random_uuid (),
  account_id  uuid not null references public.accounts (id) on delete cascade,
  business_id text not null,
  market_id   text,
  criterion_id text,
  verdict_was text,
  -- 'not_a_fit' | 'wrong_business' | 'bad_contact' | 'other'
  kind        text not null default 'not_a_fit',
  reason      text,
  at          timestamptz not null default now()
);

comment on table public.match_feedback is
  'Customer-stated reasons a match was wrong. The hand-labelled set S0-16 needs.';

create index if not exists match_feedback_business_idx
  on public.match_feedback (business_id, at desc);

alter table public.contacted      enable row level security;
alter table public.match_feedback enable row level security;

drop policy if exists contacted_read on public.contacted;
create policy contacted_read on public.contacted
  for select using (public.member_of (account_id));

drop policy if exists match_feedback_read on public.match_feedback;
create policy match_feedback_read on public.match_feedback
  for select using (public.member_of (account_id));

revoke insert, update, delete on public.contacted      from anon, authenticated;
revoke insert, update, delete on public.match_feedback from anon, authenticated;
revoke all on public.contacted      from anon;
revoke all on public.match_feedback from anon;
grant select on public.contacted      to authenticated;
grant select on public.match_feedback to authenticated;

/** Mark a business as reached out to. Idempotent — pressing it twice is the
 *  same statement, not two. */
create or replace function public.mark_contacted (
  p_account uuid,
  p_business text,
  p_channel text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.contacted (account_id, business_id, channel)
  values (p_account, p_business, nullif(btrim(coalesce(p_channel, '')), ''))
  on conflict (account_id, business_id) do nothing;
end;
$$;

/** Undo it. Somebody presses the wrong row, and a state they cannot leave is
 *  worse than one they can set. */
create or replace function public.unmark_contacted (p_account uuid, p_business text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.contacted
   where account_id = p_account and business_id = p_business;
end;
$$;

/** Record why a match was wrong. Never blocks the refund — see the note above. */
create or replace function public.record_feedback (
  p_account uuid,
  p_business text,
  p_market text default null,
  p_criterion text default null,
  p_verdict text default null,
  p_kind text default 'not_a_fit',
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.match_feedback
    (account_id, business_id, market_id, criterion_id, verdict_was, kind, reason)
  values
    (p_account, p_business, p_market, p_criterion, p_verdict,
     coalesce(nullif(btrim(p_kind), ''), 'not_a_fit'),
     nullif(btrim(coalesce(p_reason, '')), ''));
end;
$$;

revoke all on function public.mark_contacted (uuid, text, text) from public, anon, authenticated;
revoke all on function public.unmark_contacted (uuid, text) from public, anon, authenticated;
revoke all on function public.record_feedback (uuid, text, text, text, text, text, text) from public, anon, authenticated;

grant execute on function public.mark_contacted (uuid, text, text) to service_role;
grant execute on function public.unmark_contacted (uuid, text) to service_role;
grant execute on function public.record_feedback (uuid, text, text, text, text, text, text) to service_role;
