# Launch backlog — everything between here and self-serve

**Measured 2026-09-30**, by auditing the codebase against the three founding
documents of that date: the GTM plan, the user-flow spec, and the 36-artboard
design canvas. Nothing here is remembered; every "built" was checked against a
file and every "missing" against a route that does not exist.

Strategy lives in the three documents. Numbers and decisions live in
`PROJECT_PLAN.md`. This file is one thing only: **what stands between today and
a stranger paying without talking to anyone.**

---

## The one-line state of things

A stranger can sign up, search three read markets, get real businesses with
contacts and a drafted opening email, download them, and push them to HubSpot,
Instantly, Smartlead or a webhook. **That is a real product for anyone selling
into dental Phoenix, med spas Dallas or HVAC Tampa.**

What they cannot do is name a market of their own. That is the gap, and
everything in P0 is downstream of it.

---

## P0 — nothing is self-serve until these are done

### 1. The worker that drives a queued read to completion

*Blocking everything. Without it, "any trade, any US city" is a queue nobody
empties.*

`src/lib/read.ts` reads and judges one site and is proven against live sites.
`jobs` queues work, `/app/reads/[id]` shows progress, `notify.ts` writes when
it finishes. **Nothing processes the queue.** A job sits at `queued` forever.

Needs: a `/api/worker` route that claims the oldest active job, processes a
slice inside one function's time budget, advances the counters and exits; a
Vercel Cron entry to tick it; and a lease column so two ticks cannot process
the same job twice.

**It also carries the two scheduled emails.** The 48-hour nudge and the Monday
digest are written and claimed (`mail.ts`, migration `0013`) and have nothing to
fire them, because there is no scheduler on this deployment at all. They are one
more route behind the same cron entry, not a second piece of infrastructure.

### 2. Candidates for a market nobody has read

*The other half of the same blocker.*

Reading needs a list of businesses to read. That comes from Overture via DuckDB,
which is Python under `stage0/` and cannot run on Vercel. Overture **is**
reachable from a container, so extraction works — it is a batch step somebody
runs, not something the app does.

Two honest options, and they are a real decision:

- **Pre-extract.** Pick the trades and cities worth having and extract them in
  advance. Predictable cost, instant answers, a finite catalogue.
- **Extract on demand.** A small always-on worker outside Vercel (Fly, Railway,
  a cron box) that fills a `job_sites` table when a job is queued. Any city
  works; adds a service to run.

Until one is chosen, a search outside the three read markets can only queue.

### ~~3. Sign-up drops everything the doors carry~~ — done 2026-09-30

`handoff.ts` is the one place that decides what a door may carry; sign-up passes
it to `/welcome`, which creates the workspace, records `source` (first door
wins, by `coalesce` in `record_attribution`) and lands on `/app?q=…`. Two
leaking doors were found while wiring it: `/find/[slug]` pointed at a bare
`/app`, and the home CTA carried no `source`.

### ~~4. A paid plan meters nothing~~ — done 2026-09-30

`UNLOCKS_ENFORCED = true`. **Flipping the constant was the smallest part of it**,
and the audit is worth keeping because the previous version of this section said
the flip was "a decision plus a boolean":

- **The push would have broken silently.** `/api/integrations` never charged and
  called `entitled()` with no unlock set, so on the day of the flip every row
  would have been refused `not_unlocked`, `deliver` would have been handed
  nothing, and the response would have reported a successful push of zero rows.
  Charging now lives in `charging.ts`, which the download, the push and the
  unlock all call.
- **The gate was decorative.** `/app` rendered the name, phone, email and drafted
  opener of every match. Gating the download while the screen shows everything is
  not billing. A locked row now carries *no* identifying field — not blurred,
  absent, because a field that reached the browser has been given away.
- **The screen and the file disagreed about which rows existed.** `buildLeads`
  grouped then filtered; `/api/export` filtered then grouped. `matchedIn` is now
  the only ordering, and `test_unlock.mjs` reports how far the rejected one
  differed on each measured market.

The decision, stated: the count, the reasons, the evidence and the **first three
matches** are free and need no account. Names and contact details are what a
credit buys. The free plan's 20 credits are the sample. Every charging surface
prices itself on the button, before it is pressed.

### 5. No mail provider — built up to the key, 2026-09-30

Everything that does not depend on the key is done:

- `src/lib/mail.ts` holds all four messages as **pure functions** and the one
  `sendMail` primitive. `test_mail.mjs` measures 84 assertions without sending
  anything: an unsubscribe link on every message including the one the person
  asked for, no template holes, no engine vocabulary, the digest silent when
  nothing changed, correct ISO weeks across a year boundary.
- Migration `0013` adds `mail_sends`, whose **primary key is the once-only
  rule**: `(account_id, kind, period)`, with `period` empty for a once-ever
  message and an ISO week for the digest. `claim_mail` is an insert with
  `on conflict do nothing … returning`, so exactly one caller wins whatever a
  retried or overlapping scheduler tick does. Probed: `anon` denied, an
  `authenticated` non-member sees 0 rows and can neither insert nor claim.
- The **welcome** is wired, at `/welcome` — the only place that knows which door
  brought them, so it can link to the list rather than a cold search box.
- `/api/status` now reports mail, so a deployment can be asked rather than
  guessed about.

**Still open, and it is not the key:** the nudge and the digest need something to
tick. That is the same missing piece as P0.1 — there is no scheduler on this
deployment at all — so they ride on the worker's Vercel Cron entry and are
listed under it rather than here.

Needs: `RESEND_API_KEY` (and optionally `MAIL_FROM`) for anything to leave the
building, plus P0.1's cron for the two scheduled messages.

---

## P1 — the product a paying customer expects

### Screens the user-flow document specifies and the app does not have

| Screen | What it is | Note |
|---|---|---|
| `/sample` | The free-sample form: what you sell, city, email | The GTM plan's main lead magnet |
| `/app/contacted` | Businesses marked as reached out to | Stops double-emailing; the flow doc's Contacted tab |
| `/app/watchlist` | Saved searches, weekly or monthly | The habit loop; `alerts.ts` exists, the screen does not |
| Shared list view | Read-only list + "Get your own" | A referral door with nothing to build behind it |

### Per-card actions

Only **Copy email** is built. The flow document specifies five:

| Action | State |
|---|---|
| Copy email | built |
| Edit email in place | missing |
| Rewrite in another tone | missing |
| Mark as contacted | missing |
| Not a fit → refund on the spot | missing — and it is the trust move, not a nicety |

### Search modes

Typing works. The flow document specifies four: **map** (exists at
`/app/explore`, demoted and not reachable as a tab), **templates** (exist at
`/templates`, not wired into the search box), and **upload a CSV** (not built —
and it is the one that needs no candidate extraction at all, because the
customer brings the list).

> **Worth noting:** CSV upload is the cheapest path to "any market" in this
> whole document. It sidesteps P0.2 entirely. A customer who already has a list
> gets it checked, with emails, today.

---

## P2 — GTM, in the order the plan needs it

Everything here is downstream of P0.3, because every door leads to sign-up.

| Asset | State | Note |
|---|---|---|
| Personal door `/for/{slug}` | **built** | Real counts, real businesses, four guards on which rows show |
| SEO pages `/find/{slug}` | 3 pages | The GTM plan wants 300; each needs a read market, so this is gated on P0.1–2 |
| Template pages `/templates/{slug}` | 4 pages | Built, not linked from the product |
| Free sample form | missing | P1 |
| Weekly digest | `alerts.ts` built, no sender | P0.5 |
| Referral "give 100, get 100" | missing | Credit plumbing exists in the ledger |
| Attribution (`source` → account) | missing | P0.3; without it no channel can be judged |
| Daily control email | missing | The GTM plan's one-email operating surface |

**Free tools the plan names, none yet wired:** Tally or a plain form for the
sample, F5Bot for Reddit/HN mentions, Google Search Console, n8n for the
scheduling glue.

---

## The honest order

1. ~~**P0.3 sign-up context**~~ — done 2026-09-30.
2. ~~**P0.4 flip the gate**~~ — done 2026-09-30. Estimated at "a decision plus a
   boolean"; it was a day, and the estimate is the finding: the gate had three
   surfaces and only one of them had ever been wired to the ledger.
3. **P0.5 mail** — a key, then an hour.
4. **P1 CSV upload** — the cheapest route to "any market", and it skips P0.2.
5. **P0.1 worker** — the real engineering.
6. **P0.2 candidates** — the real decision.
7. P1 screens, then P2 at volume.

Items 1–4 are days and make the product sellable to people who bring their own
list. Items 5–6 are what make it self-serve for a stranger who brings only a
city.

---

## What is already built, so nobody rebuilds it

Reading and judging a site (`read.ts`, proven live) · the queue, progress page
and completion note (`jobs.ts`, migration 0011, `/app/reads/[id]`) · lead
assembly with contacts and drafted openers (`leads.ts`) · export with charging
(`/api/export`) · **push to HubSpot, Instantly, Smartlead and signed webhooks**
(`deliver.ts`, wired into the results screen 2026-09-30) · accounts, ledger,
comped workspaces, Stripe checkout and webhooks · suppression and opt-out ·
the public-records catalogue (`sources.ts`) · the home page, the personal door,
mobile across every route, and the motion.
