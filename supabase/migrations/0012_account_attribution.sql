-- Where a workspace came from, and what it said it wanted.
--
-- Every door writes its context into the sign-up link. Until now the sign-up
-- page read none of it, so the user retyped what the page had just shown them
-- and, worse, no paying customer could be traced to the door that brought them.
-- The GTM plan's whole decision — where to spend more — rests on that trace.
--
-- Nullable and never required: a workspace created any other way is not
-- second-class, it simply has no source.
alter table public.accounts
  add column if not exists source      text,
  add column if not exists sells       text,
  add column if not exists first_query text;

comment on column public.accounts.source is
  'The door: for/{slug}, find/{slug}, sample, home, referral. Null when unknown.';
comment on column public.accounts.sells is
  'What the customer told a door they sell, carried through sign-up.';
comment on column public.accounts.first_query is
  'The search the door promised, so the first list needs no typing.';

create or replace function public.record_attribution (
  p_account uuid,
  p_source text default null,
  p_sells text default null,
  p_query text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- First door wins. A customer who later arrives through a different link has
  -- already been attributed, and overwriting it would credit the last touch to
  -- a channel that did not do the work.
  update public.accounts
     set source      = coalesce(source, nullif(btrim(p_source), '')),
         sells       = coalesce(sells, nullif(btrim(p_sells), '')),
         first_query = coalesce(first_query, nullif(btrim(p_query), ''))
   where id = p_account;
end;
$$;

revoke all on function public.record_attribution (uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_attribution (uuid, text, text, text) to service_role;
