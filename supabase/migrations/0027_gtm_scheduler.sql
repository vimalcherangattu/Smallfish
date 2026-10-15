-- The outreach scheduler, moved off Vercel Cron (GTM, 2026-10-15).
--
-- Vercel Hobby runs a cron once a day, somewhere in the hour, and on the day
-- the push route shipped it did not run at all. pg_cron runs on the minute and
-- as often as we like, for nothing.
--
-- Authorisation without a Vercel variable: a 64-hex secret is generated here,
-- inside Vault, and never printed. `gtm_call` sends it as `x-smallfish-cron`;
-- the route calls `gtm_cron_ok` (service role only) to check it.

create extension if not exists pg_net;
create extension if not exists pg_cron;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'gtm_cron') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'gtm_cron',
      'Header Supabase sends when it calls the outreach routes');
  end if;
end $$;

create or replace function public.gtm_cron_ok(token text)
returns boolean language sql security definer set search_path = '' as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'gtm_cron' and decrypted_secret = token and length(token) = 64
  );
$$;
revoke all on function public.gtm_cron_ok(text) from public, anon, authenticated;
grant execute on function public.gtm_cron_ok(text) to service_role;

create or replace function public.gtm_call(path text)
returns bigint language sql security definer set search_path = '' as $$
  select net.http_get(
    url := 'https://www.getsmallfish.com' || path,
    headers := jsonb_build_object('x-smallfish-cron',
      (select decrypted_secret from vault.decrypted_secrets where name = 'gtm_cron')),
    timeout_milliseconds := 60000
  );
$$;
revoke all on function public.gtm_call(text) from public, anon, authenticated;

-- The schedule. Sweeps every 30 minutes (about 60 agency sites each), the push
-- every hour (prepare lists, queue, go live when warm).
select cron.schedule('gtm-prospects', '*/30 * * * *', $$select public.gtm_call('/api/outreach/prospects')$$);
select cron.schedule('gtm-push', '7 * * * *', $$select public.gtm_call('/api/outreach/push')$$);
