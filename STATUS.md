# Status

**Last updated:** 2026-11-10 (cold email; build plan section as of 11-02; the rest as of 2026-10-24) · search restored after an outage; data-sourcing plan adopted;
outreach sweeps moved off Vercel to GitHub Actions.

`CLAUDE.md` holds the rules that do not change. This file is only the current state,
and it is rewritten at the end of each session. Where the two disagree, CLAUDE.md wins.

## Current state

- **2026-11-10: cold email measured, and changed.** 2–10 Nov: 210 people, 352 emails, 0 human
  replies, 0 sign-ups (`accounts`: 4 ever, last 4 Oct). Now every email links straight into
  `/app/find` with their trade and city typed (`/hi/<token>` is a logging redirect); the free
  list page and the widget offer are gone. **Stopping rule** (`stoprule.ts`, top of the digest):
  500 people reached since 11-10 with nobody wanting it → stop or change. **Seeds**
  (`OUTREACH_SEEDS`, not yet set) show whether the mail lands in spam; DKIM is now checked daily.

- **2026-10-24: search was down** (every count 500) because Overture deleted the release
  `supply.ts` pinned, and the surviving releases renamed the category column and its ids.
  Restored on `2026-10-21.0`: `trades.json` rebuilt (1,732 categories, 19.5M US listings),
  `supply.ts` reads `taxonomy.primary`, falls forward to a newer release if the pin vanishes,
  and `trades.ts` uses the taxonomy's own hierarchy (dentists → orthodontics etc.).
  Canary counts, local build against S3: Denver dentists 2,396 · Denver plumbers 515 ·
  Tampa HVAC 821 · Dallas med spas 853 · Columbus vets 289.
- **Production reads our own copy** (2026-10-24): R2 bucket `smallfish-places-us` (ENAM),
  513 tiles of 2° grid cells, tile index in the manifest, DuckDB at 16 threads. Uncached
  searches 3.0–5.4 s, cached repeats instant (`supply_counts`, migration 0033, applied).
  The first bucket was in APAC by mistake and is no longer read; the owner deletes it.
  GitHub Actions secrets are set, so the Monday job keeps the copy current.
- **Data sourcing is re-planned: `docs/DATA-SOURCING.md`.** Step 0 (restore) is done.
  **Step 1, the snapshot half, is built and waiting on Cloudflare keys** (`docs/SETUP.md` §8b):
  `snapshot_places.py` copies a release's US places to R2 (measured: 18.4M places, 1.2 GB,
  Denver reads 11 of 361 row groups), promotes only past a contract (schema, 100% of
  `trades.json` ids present, 15 canaries within ±15%), and a weekly GitHub Action keeps it
  current. `supply.ts` reads the copy when `R2_*` is set and falls back to Overture
  directly when it is not or when the copy fails. Entity ids and provenance are the
  other half of step 1, not started.
- Not yet migrated: `stage0/src/engine/geometry.py` and `stage0/src/coverage/overture_extract.py`
  still read `categories.primary` on `2026-08-19.0`. Stage 0 benchmark tooling only; no
  customer path. CLAUDE.md's "1,644 categories, 17.2M listings" is stale for the same reason.

- **Outreach sweeps run on GitHub Actions, not Vercel (2026-10-24).** The pg_cron jobs
  calling `/api/outreach/{counts,credits,prospects}` used 100% of the Vercel team's Hobby
  CPU (4 h/month, team-wide: over it, all 12 projects pause). Those three jobs are paused
  (migration `0032`); `.github/workflows/gtm-sweeps.yml` runs them through
  `scripts/gtm-runner.ts` → `src/lib/gtmjobs.ts` (prospects 6×/day, credits 4×, counts
  daily). Rule: no DuckDB scan or multi-site crawl in a Vercel function on a schedule.
  First green run: New York, 120 sites read in 94 s, 32 found with an address. The repo
  is public, so Actions logs are public: the runner prints counts only (`publicError`).
  `gtm-push` (hourly) and `gtm-digest` (daily) still call Vercel. Push scans only when a
  found prospect has no list yet.
- **Cold email:** nothing sends before `GO_LIVE` 2026-10-26 (moved from 11-02 by the owner, 10-24); 114 queued. Copy rewritten in
  one person's voice (`sequence.ts`) and re-synced to Instantly hourly.

- **The one problem** (CLAUDE.md §1) and the **DEW / GEW / MIW** effort tiers (§2) are the
  cut every change is measured against. Read both before planning work.
- **PRD v2:** milestone 2 live at `/app/find` (two fields, a real Overture count, five real
  samples, no account). Milestone 3 in progress. `/app` is still the older
  single-sentence search and still works.
- Suite: **84 of 85 after `npm run build`** (1 skipped). The skipped files check nothing without a build or a local benchmark run
  and each says which. Eight `check_*` files need a live server and are not in that count.
- Built and not yet on a screen: `fit.ts` (Strong/Maybe/No, blind rows, reveal spends the
  credit), `rules.ts` (the free listing pre-filter).

## In progress

Nothing mid-change; the working tree is clean.

## Next step

**Build plan of 1 Nov (owner asked for all six, one by one; tracked in Task Hub, sf-product):**
1. ~~Headless fetcher~~ → **read reliability, built 1 Nov** (decision log, 2026-11-01). One read per
   website, chains (5+ listings on one site) left out, one retry on temporary failures, home page
   when a deep link fails, outcomes `unsure.ts` can explain. Headless dropped on the measurement.
2. ~~"Get specific"~~ **built 1 Nov**: optional "What do you sell?" (`intake.ts` over `icp.ts`), and
   source / categories / offer carried to sign-up. Also fixed: plural offers ("website redesigns")
   matched no signal in `signals.ts`.
3. Strong / Maybe / No and the two-sentence judge on the results screen (`fit.ts`). **First part
   built 1 Nov:** builder questions settle from the page source (17 of 20 couldn't-tells with pages).
4. ~~Named contacts~~ **built 2 Nov** (3acf516, migration 0035): 6 of 35 real sites now name a
   decision-maker (from 0). CSV/CRM push and GTM's prospect store do not carry the person yet.

**Also built 2 Nov, from the GTM session's measurements:** headless rendering in the GitHub runner
(never Vercel), public DNS before "dead", http retry after a bad certificate (00cda03); the
criterion "has a website that is down or insecure" (ea8caa5, polarity fix 72ea51a); `/app/find`
counts only live sites as readable (de7146b, migration 0034).
**Still open from item 3:** Strong / Maybe / No needs multi-rule jobs and changes what a credit
buys. Heads-up given in chat 1 Nov; waiting on the owner's go.
5. `rules.ts`: free listing rules before any paid read.
6. Search nits: "dog groomers" → "mens grooming salon" as a near category; metro samples under a city label.

Older list, still true:

0. **Data sourcing step 1** (`docs/DATA-SOURCING.md`): snapshot, adapter contract test,
   entity ids, provenance. Outranks the fetcher because search being up outranks search
   being good.
1. **Headless fetcher fallback** — plain fetch, then headless on failure. This is the DEW
   ceiling, not a milestone-3 line item: 20 of 48 production reads returned zero pages
   (42%, one metro, thin), and a judge handed zero pages can only say "couldn't tell".
2. Wire `rules.ts` to a screen. Listing rules cost nothing, so filtering before spending a
   read is the cheapest margin there is.
3. The judge: Strong / Maybe / No, two sentences, per-rule outcomes.

## Known issues

- ~~`?source=` is dropped on arrival~~ **Fixed 1 Nov** (plan item 2): `/app/find` reads `?what=&where=&source=`
  and counts on arrival; "Get specific" carries source and the counted categories; Discover has the
  optional "What do you sell?" field and its sign-up link keeps `source` and `sells`. PostHog funnel
  work is unblocked.
- **Zero-page reads were 42% with one chain in the sample, 20% without it** (decision log 2026-11-01).
  Couldn't-tell is still 62% without the chain, mostly on four-page reads: the judge, plan item 3.
- ~~Instantly returns 402 since 29 Oct~~ **Retracted 10 Nov:** leads queued daily 1–10 Nov (822), 352 emails sent. Billing is fine.
- **The R2 copy's tile index intermittently reads empty** (24 times 24 Oct – 1 Nov); search falls
  back to Overture directly and takes ~11 s. Needs the R2 keys to diagnose.
- **S0-16 labelling is THIN:** 142 labels across one market (`dental-phoenix`, 72 + 70).
  Gate item 2 (precision) needs 3 × 100 and cannot be measured until then. A tracker entry
  says "2 × 100 done" on 21 Oct; no label file has been committed, so that output never
  reached the repo.
- **No `ANTHROPIC_API_KEY` in the session container** (production has one). Blocks the
  Stage 0 benchmark only, never a customer. Re-run `preflight.py` rather than trusting prose.
- Migrations `0022`/`0023` are unapplied, superseded by one set written against PRD v2.
- Three stale remote branches (`claude/product-margin`, `claude/eager-archimedes-qdetjj`,
  `claude/stage-0-benchmark-lx4tgf`) are merged or superseded and await a prune decision.
  `claude/eager-archimedes-qdetjj` was the **repo's default branch** until 2026-10-24, which
  is why no workflow had ever run; the default is now `main`.
- **The daily GTM digest said "all running" through a five-day outage** of the prospect
  finder (2026-10-19 → 24). It does not read scheduler or Actions failures.
- CPU per call of the two daily Vercel crons (`/api/worker`, `/api/mail/nudge`) is unmeasured.

## Fresh-container setup, in this order

```bash
npm install
python3 -m pip install duckdb "httpx[http2]"   # NOT bare `pip` — see CLAUDE.md
```

A fresh container may also check out the old session branch rather than `main` (likely
because it was the repo default until 2026-10-24). Check `git branch --show-current`
before believing anything in `CLAUDE.md` looks missing.
