# Cold outreach: how it works (GTM, 2026-10-15)

Zero human interaction by the owner's decision of 2026-10-15: no demos, no calls,
no human support. The product sells itself or it does not.

## The loop

1. **Find** (`scripts/gtm-runner.ts prospects`, on GitHub Actions six times a day,
   `.github/workflows/gtm-sweeps.yml`). One of the 50 largest US cities per day, up to 120
   sites a run: Overture's agency categories, each agency's own site read with `readSite`.
   `prospects.ts` decides which trade it serves (needs marketing context, three distinct
   sentences or a headline) and picks an address on its own domain. Measured yield: about
   1 to 3% of agencies read become sendable prospects. `credits` (footer "Website by X"
   mining, four a day) and `counts` (the /how-many pages, daily) run the same way.
   **Not on Vercel:** until 2026-10-24 pg_cron called these routes every 30–60 minutes and
   they used the Vercel team's whole Hobby CPU allowance, which pauses all twelve projects
   when it runs out. The routes remain for a by-hand call; nothing schedules them
   (migration 0032). The work is `src/lib/gtmjobs.ts`, shared by both.
2. **Prepare** (`/api/outreach/push`, hourly at :07 from pg_cron, still on Vercel). Each
   prospect gets a `/hi/<token>` page and a count of its trade in its city. That count is a
   DuckDB scan, up to four a run, and only when a found prospect has no list yet.
3. **Queue.** `sequence.blocked()` gates; survivors go to the Instantly campaign
   "Small Fish · agencies · v1" with their variables. Status → `queued`.
4. **Send.** The campaign is created paused. It starts only after `GO_LIVE`
   (2026-10-26; was 11-02 until the owner moved it on 10-24) **and** once Instantly reports every inbox ready, then ramps 5 → 25
   per inbox per day over five weeks. Three steps, 3 and 4 days apart, from the
   partners' own inboxes (Ashitha, Dhananjay, Dipti).
5. **Click.** `/hi/<token>` shows the count and builds three businesses missing the
   thing the agency sells, on the first visit only (≤40 model reads, ~$0.09 to $0.21,
   20 lists a day across all tokens). One button into sign-up with the search typed,
   `source=outreach/<token>`.
6. **Reply.** Instantly's webhook → `/api/outreach/hook`. Every event is logged.
   Replies are answered by `replies.ts` from a fact sheet built from `PLANS`. Stop
   words block everywhere before the model is asked. A draft with an invented price or
   an offer of a call is held, not sent. Three answers per thread at most.
7. **Track.** `/ops/outreach`, owner only (`OPS_EMAILS`). Funnel from read to paid,
   replies and what we said, held items, every prospect with its list.

## Tables (Small Fish Supabase)

| Table | What |
|---|---|
| `gtm_prospects` | One row per agency domain, its niche, address, status and list |
| `gtm_events` | Everything that happened, ours and Instantly's |
| `gtm_suppressed` | Addresses and domains that asked us to stop |

## Open items

- Instantly may only offer webhooks on a higher plan. If registering fails, the push
  route says so and logs `webhook_failed`; sending still works, replies then wait in
  Instantly's inbox.
