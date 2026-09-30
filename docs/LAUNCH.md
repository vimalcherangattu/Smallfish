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

### 1. The worker — built 2026-09-30, needs one environment variable

`/api/worker` claims the oldest job with work left, reads what fits in its
budget, writes it, and exits; `vercel.json` ticks it every minute. Migration
`0014` adds `job_sites` (the work list), a lease on `jobs`, and the five
functions the worker runs on. Every one was exercised against the live database
before the TypeScript was written: a second worker was refused the lease, a
second take skipped the rows in flight, recording the same slice twice moved no
counter, and thirty-minute-old `taken` rows came back to the queue.

**It has real work today, with no Overture pull and no upload.** The three
measured markets hold **6,814 businesses with a website nobody has read** —
2,578 in dental Phoenix alone, against the 200 the results screen is built on.
The screen now says so and offers the rest, which is the honest version of a
coverage number that was always a fifth of a market presented as a market.

**Two things are needed before it runs:**

1. `CRON_SECRET` in the Vercel project. The route refuses when it is unset
   rather than defaulting to open — it spends crawl and model budget on every
   tick, so an open endpoint is a bill anybody can run up.
2. A Vercel plan that allows a **minute-level cron**. Hobby permits one cron a
   day, which for this route is the same as not having one. `vercel.json` asks
   for `* * * * *`.

Measured throughput, 48 real unread sites: **795 ms per site**, so dental
Phoenix's remainder is about 34 minutes of reading — against the 23 the
estimate promises. See the note at the top of `src/lib/jobs.ts`: the estimate is
optimistic and the constants were deliberately not changed on a 48-site sample.

**Still to ride on the same cron:** the 48-hour nudge and the Monday digest
(`mail.ts`, migration `0013`). They are written and claimed and need only a
route behind the same schedule.

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

> **Built 2026-09-30.** `/app/upload` — the cheapest path to "any market" in
> this whole document, and it sidesteps P0.2 entirely. The criterion comes from
> `signals.ts`, never from free text, so the catalogue's refusals still apply:
> the four unprovable signals are shown with what settling them would take, and
> `criterionForCheck` returns null for every one of them. Parsed twice by the
> same function — in the browser so the screen can say what it found before
> anything is sent, and on the server, which trusts none of it. Every row is
> read, skipped with a line number and a reason, or counted as a duplicate.

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
4. ~~**P1 CSV upload**~~ — done 2026-09-30. It still needs the worker to run
   (B-1, B-2), because an upload queues a job like any other read.
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
