-- Small Fish · the waitlist, and why the home page points at one (S2-13)
--
-- The home page copy of 2026-09-26 sends every button to sign-up, and sets its
-- own condition for doing so:
--
--     "A new user must be able to describe a market and get a real list back,
--      or the page is promising something the product can't do yet. If that
--      isn't ready, change two strings and nothing else: the buttons become
--      Join the waitlist."
--
-- That condition is not met. Somebody can sign up today and get a real list —
-- but only for the three markets already read, not for a market they describe.
-- Reading one cold needs a model key that is not set anywhere. So the buttons
-- say waitlist, and this is where the names go.
--
-- **The market they describe is the point of the table, not the email.** An
-- email address on its own is a number to report; "roofers in Sacramento who
-- don't show pricing" is the queue telling us which market to read first. The
-- column is free text on purpose — the moment it becomes a dropdown it only
-- collects the markets we already thought of.

create table public.waitlist (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  -- What they would search for, in their words. Optional: somebody who only
  -- wants to be told when it opens should not be stopped by a second field.
  market     text,
  -- Where they came from, when a link carried it. Never a fingerprint; this is
  -- for "which post worked", not for identifying anybody.
  source     text,
  created_at timestamptz not null default now(),
  -- Set when they are let in, so the queue can be worked rather than admired.
  invited_at timestamptz
);

-- One row per address. A second submission updates the market rather than
-- adding a duplicate — people resubmit, and a waitlist that counts them twice
-- reports a number that is wrong in the flattering direction.
create unique index waitlist_email_idx on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

-- **No policy at all, deliberately.** Nobody reads this from a client: not the
-- person who joined, and not another visitor. Every read is server-side with
-- the service role. A waitlist that can be listed from the browser is a
-- competitor's lead list.
revoke all on public.waitlist from anon, authenticated;

-- Joining is a write, and writes here go through a function like every other
-- table in this schema.
create or replace function public.join_waitlist (
  p_email text,
  p_market text default null,
  p_source text default null
)
returns table (joined boolean, already boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing uuid;
begin
  if p_email is null or position('@' in p_email) = 0 then
    return query select false, false;
    return;
  end if;

  select w.id into v_existing from public.waitlist w
  where lower(w.email) = lower(trim(p_email));

  if v_existing is not null then
    -- Keep the market they described if this visit did not carry one, for the
    -- same reason `record_run` keeps the query: the sentence explaining why
    -- they are in the queue is worth more than the visit that overwrote it.
    update public.waitlist
    set market = coalesce(nullif(trim(coalesce(p_market, '')), ''), market),
        source = coalesce(source, p_source)
    where id = v_existing;
    return query select true, true;
    return;
  end if;

  insert into public.waitlist (email, market, source)
  values (
    trim(p_email),
    nullif(trim(coalesce(p_market, '')), ''),
    nullif(trim(coalesce(p_source, '')), '')
  );
  return query select true, false;
end;
$$;

revoke all on function public.join_waitlist (text, text, text) from public, anon, authenticated;
