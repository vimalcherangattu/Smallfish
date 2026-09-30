-- What was contacted, not just which id was contacted.
--
-- `0016` stored `(account_id, business_id)` and nothing else, on the reasoning
-- that the name could be looked up. It cannot, for the case that matters most:
--
--   - A business from a **market** is in a file on disk, so a lookup means
--     opening a multi-megabyte JSON per market to render a list of forty names.
--   - A business from an **upload** is in `job_sites` and nowhere else, keyed by
--     an id this product minted (`upload:<job>:<n>`). Once that job is gone, the
--     id resolves to nothing at all.
--
-- So the Contacted screen would have been a list of opaque ids for exactly the
-- customers who brought their own list — the ones upload exists for.
--
-- The name and site are written at the moment of contact and are **deliberately
-- a snapshot**: what the business was called when you wrote to them. A later
-- re-read may rename it, and a history that silently updates itself is not a
-- history.

alter table public.contacted
  add column if not exists name text,
  add column if not exists site text;

comment on column public.contacted.name is
  'The name as it stood when they were contacted. A snapshot, not a reference.';

create or replace function public.mark_contacted (
  p_account uuid,
  p_business text,
  p_channel text default null,
  p_name text default null,
  p_site text default null
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.contacted (account_id, business_id, channel, name, site)
  values (
    p_account, p_business,
    nullif(btrim(coalesce(p_channel, '')), ''),
    nullif(btrim(coalesce(p_name, '')), ''),
    nullif(btrim(coalesce(p_site, '')), '')
  )
  on conflict (account_id, business_id) do update
    -- Marking twice is still one statement, but a row stored before this
    -- migration has no name; fill it in rather than leaving it opaque forever.
    set name = coalesce(public.contacted.name, excluded.name),
        site = coalesce(public.contacted.site, excluded.site);
end;
$$;

revoke all on function public.mark_contacted (uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.mark_contacted (uuid, text, text, text, text) to service_role;

-- The three-argument form from `0016` is gone: two overloads would let a caller
-- silently take the one that drops the name.
drop function if exists public.mark_contacted (uuid, text, text);
