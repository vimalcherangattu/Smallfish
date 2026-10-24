-- The outreach scheduler as it actually stands in the database (2026-10-24).
--
-- Retraction: 0027 recorded two jobs (gtm-prospects, gtm-push). The database
-- had five. gtm-counts, gtm-credits and gtm-digest were scheduled by hand and
-- never written down, so the repo described a scheduler that made ~350 calls a
-- week while the real one made ~1,000, most of them DuckDB scans of Overture
-- and multi-site crawls inside Vercel functions. On 2026-10-24 that used 100%
-- of the team's Hobby allowance of 4 hours/month Fluid Active CPU, which is
-- team-wide: going over pauses all twelve projects, not just Smallfish.
--
-- The three heavy jobs were paused the same day (owner's instruction). They
-- stay paused here. Nothing that scans Overture or crawls sites may run in a
-- Vercel function on a schedule; those sweeps move to a runner that does not
-- bill Vercel CPU (PROJECT_PLAN.md, Decision log, 2026-10-24). Say so in chat
-- before setting any of them active again.
--
-- Idempotent: each job is (re)scheduled by name, then its active flag set.

select cron.schedule('gtm-prospects', '*/30 * * * *', $$select public.gtm_call('/api/outreach/prospects')$$);
select cron.schedule('gtm-push',      '7 * * * *',    $$select public.gtm_call('/api/outreach/push')$$);
select cron.schedule('gtm-counts',    '20,50 * * * *', $$select public.gtm_call('/api/outreach/counts')$$);
select cron.schedule('gtm-digest',    '3 12 * * *',   $$select public.gtm_call('/api/outreach/digest')$$);
select cron.schedule('gtm-credits',   '40 * * * *',   $$select public.gtm_call('/api/outreach/credits')$$);

-- Paused 2026-10-24: each one runs a DuckDB/Overture scan, a crawl, or both.
select cron.alter_job(jobid, active := false)
from cron.job where jobname in ('gtm-prospects', 'gtm-counts', 'gtm-credits');

-- Left on. The digest is one email a day. Push queues leads through Instantly's
-- API, but it also prepares free lists, and each prepare is an Overture count
-- scan (up to four a run). It scans only for found prospects with no list yet:
-- there were none on 2026-10-24, and with gtm-prospects paused none appear. A
-- prospect added by hand would bring the scans back, hourly.
select cron.alter_job(jobid, active := true)
from cron.job where jobname in ('gtm-push', 'gtm-digest');
