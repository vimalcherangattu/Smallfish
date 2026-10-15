# Cold outreach: how it works (GTM, 2026-10-15)

Zero human interaction by the owner's decision of 2026-10-15: no demos, no calls,
no human support. The product sells itself or it does not.

## The loop

1. **Find** (`/api/outreach/prospects`, daily cron 05:41 UTC). One of the 50 largest
   US cities a day: Overture's agency categories, each agency's own site read with
   `readSite`. `prospects.ts` decides which trade it serves (needs marketing context,
   three distinct sentences or a headline) and picks an address on its own domain.
   Measured yield: about 1 to 3% of agencies read become sendable prospects.
2. **Prepare** (`/api/outreach/push`, daily cron 13:53 UTC). Each prospect gets a
   `/hi/<token>` page and a count of its trade in its city. One count query, no reads.
3. **Queue.** `sequence.blocked()` gates; survivors go to the Instantly campaign
   "Small Fish · agencies · v1" with their variables. Status → `queued`.
4. **Send.** The campaign is created paused. It starts only after `GO_LIVE`
   (2026-11-02) **and** once Instantly reports every inbox ready, then ramps 5 → 25
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

- `OPS_EMAILS` must be set on Vercel for `/ops/outreach` to open.
- The postal code is missing from the footer address.
- Instantly may only offer webhooks on a higher plan. If registering fails, the push
  route says so and logs `webhook_failed`; sending still works, replies then wait in
  Instantly's inbox.
