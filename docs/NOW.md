# Now

The live state of the Small Fish build, in one short file.

**This file is rendered by the `smallfish-now` mod** as a pane in the Claude Code
session, so it is the first thing the owner sees. It exists because context ran out on
2026-10-15 and the answer to "where are we?" had to be reconstructed from git, the
database and production. That reconstruction should never be needed twice.

Rules for whoever edits it:

- **Keep the four `##` headings exactly as they are.** The mod parses them by name.
- One line per bullet, short enough to read in a narrow pane. Detail belongs in
  `PROJECT_PLAN.md`; this file is a dashboard, not a record.
- Update it in the same commit as the work it describes. A stale dashboard is worse
  than none, because it is believed.
- Anything under **On Vimal** is blocking or near-blocking and nobody else can do it.

## On Vimal

- Nothing. Apify, Resend and the provider check are done; pricing, labelling and gate item 1 came off this list on 2026-10-15.
- Optional whenever you like: set `SUPPLY_PROVIDER=apify`. Safe now that counting is pinned to free Overture.

## In flight

- Milestone 3, slice 3: one migration against the PRD shape, then the judge.

## Where the product is

- PRD v2 adopted 2026-10-15. Milestone 2 of 6 done, 3 in progress.
- **Testable now: `/app/find`** — two fields, a real count, five samples. No account.
- `/app` is still the old single-sentence search, and still works. It gets replaced once milestone 3 can read.
- Pricing re-solved to hold a 70% gross margin floor: bands 1/4/5, 3 reads a credit, 12 reviews a match.
- Counting is pinned to free Overture; only reading uses the paid provider.
- Built but not yet wired to a screen: `fit.ts` (blind rows, reveal), `rules.ts` (listing pre-filter).
- Built: supply for any US city, polite fetcher, contacts, credits, Stripe, CSV, opt-out.
- Built 2026-10-15: `fit.ts` — Strong/Maybe/No, blind rows, a credit buys a reveal.
- Provider: Apify Compass, keys set, default still Overture until the check reads clean.
- Production: live on `main`, suite 76/76.
- Known hole: 42% of reads return zero pages. The headless fallback is milestone 3.
- Known deviation: no rising pool count. Overture returns one total, so a number before it lands would be invented.
- Not applied: migrations 0022/0023, superseded by one set written against the PRD.
