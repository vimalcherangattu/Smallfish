-- Counts are measured once a week, not once a visitor (2026-10-24).
--
-- The Vercel team hit 100% of its Hobby Active CPU on 2026-10-24, and going over
-- pauses every project on it. Every free count — /api/pool, /api/supply, the MCP
-- count — ran a DuckDB scan inside the function, ~9-20s per city, and nothing
-- stopped the same city being counted again by the next visitor, or by the same
-- one pressing the button twice.
--
-- `supply_counts`: one row per (provider, categories, region, radius). A hit
-- inside the TTL is served without opening DuckDB. The row keeps when it was
-- measured, and the screen says that date: the number is still a measured one.
--
-- `scan_log` + `take_scan`: an anonymous visitor may cause only so many *fresh*
-- scans per hour and per day from one address. Cache hits are not counted —
-- they cost nothing. The address is stored only as a salted hash.
create table if not exists public.supply_counts (
  key text primary key,
  provider text not null,
  release text,
  listings int not null,
  with_site int not null,
  -- The five sample rows /app/find shows, so a cached count needs no row scan.
  -- Null when the count came from a count-only caller.
  samples jsonb,
  ms int,
  computed_at timestamptz not null default now()
);
alter table public.supply_counts enable row level security;

create table if not exists public.scan_log (
  ip_hash text not null,
  at timestamptz not null default now()
);
create index if not exists scan_log_ip_at on public.scan_log (ip_hash, at desc);
alter table public.scan_log enable row level security;

-- Atomic: count and insert under one advisory lock per address, so two parallel
-- requests cannot both take the last scan of the hour.
create or replace function public.take_scan(p_ip text, p_per_hour int, p_per_day int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  hour_n int;
  day_n int;
begin
  perform pg_advisory_xact_lock(hashtext('scan:' || p_ip));
  select count(*) filter (where at > now() - interval '1 hour'),
         count(*)
    into hour_n, day_n
    from scan_log
   where ip_hash = p_ip and at > now() - interval '1 day';
  if hour_n >= p_per_hour or day_n >= p_per_day then
    return false;
  end if;
  insert into scan_log (ip_hash) values (p_ip);
  -- Keep the table small without a scheduler: an address's own old rows go
  -- when it next asks.
  delete from scan_log where ip_hash = p_ip and at < now() - interval '2 days';
  return true;
end;
$$;

revoke all on function public.take_scan(text, int, int) from public, anon, authenticated;
grant execute on function public.take_scan(text, int, int) to service_role;
