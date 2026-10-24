# Status

**Last updated:** 2026-10-24 · search restored after an outage; data-sourcing plan adopted.

`CLAUDE.md` holds the rules that do not change. This file is only the current state,
and it is rewritten at the end of each session. Where the two disagree, CLAUDE.md wins.

## Current state

- **2026-10-24: search was down** (every count 500) because Overture deleted the release
  `supply.ts` pinned, and the surviving releases renamed the category column and its ids.
  Restored on `2026-10-21.0`: `trades.json` rebuilt (1,732 categories, 19.5M US listings),
  `supply.ts` reads `taxonomy.primary`, falls forward to a newer release if the pin vanishes,
  and `trades.ts` uses the taxonomy's own hierarchy (dentists → orthodontics etc.).
  Canary counts, local build against S3: Denver dentists 2,396 · Denver plumbers 515 ·
  Tampa HVAC 821 · Dallas med spas 853 · Columbus vets 289.
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

- **The one problem** (CLAUDE.md §1) and the **DEW / GEW / MIW** effort tiers (§2) are the
  cut every change is measured against. Read both before planning work.
- **PRD v2:** milestone 2 live at `/app/find` (two fields, a real Overture count, five real
  samples, no account). Milestone 3 in progress. `/app` is still the older
  single-sentence search and still works.
- Suite: **81 of 82 after `npm run build`** (1 skipped), **79 of 82 on a bare clone**
  (3 skipped). The skipped files check nothing without a build or a local benchmark run
  and each says which. Eight `check_*` files need a live server and are not in that count.
- Built and not yet on a screen: `fit.ts` (Strong/Maybe/No, blind rows, reveal spends the
  credit), `rules.ts` (the free listing pre-filter).

## In progress

Nothing mid-change; the working tree is clean.

## Next step

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

- **`?source=` is dropped on arrival.** GTM's doors send `?source=home`, `?source=check…`
  and `?source=outreach/<token>` to `/app/find`; `find/page.tsx` renders `<PoolSearch />`
  with no props and never reads `searchParams`. Attribution is lost, and it blocks the
  PostHog funnel work. Open task, due 23 Oct, not started.
- **42% of reads return zero pages** — see Next step 1.
- **S0-16 labelling is THIN:** 142 labels across one market (`dental-phoenix`, 72 + 70).
  Gate item 2 (precision) needs 3 × 100 and cannot be measured until then. A tracker entry
  says "2 × 100 done" on 21 Oct; no label file has been committed, so that output never
  reached the repo.
- **No `ANTHROPIC_API_KEY` in the session container** (production has one). Blocks the
  Stage 0 benchmark only, never a customer. Re-run `preflight.py` rather than trusting prose.
- Migrations `0022`/`0023` are unapplied, superseded by one set written against PRD v2.
- Three stale remote branches (`claude/product-margin`, `claude/eager-archimedes-qdetjj`,
  `claude/stage-0-benchmark-lx4tgf`) are merged or superseded and await a prune decision.

## Fresh-container setup, in this order

```bash
npm install
python3 -m pip install duckdb "httpx[http2]"   # NOT bare `pip` — see CLAUDE.md
```

A fresh container may also check out the old session branch rather than `main`. Check
`git branch --show-current` before believing anything in `CLAUDE.md` looks missing.
