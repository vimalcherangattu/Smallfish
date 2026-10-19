# Now

The live state of the Small Fish build, in one short file.

**This file is rendered by the `smallfish-now` mod** as a pane in the Claude Code
session, so it is the first thing the owner sees. It exists because context ran out on
2026-10-15 and the answer to "where are we?" had to be reconstructed from git, the
database and production. That reconstruction should never be needed twice.

Rules for whoever edits it:

- **Keep the three parsed `##` headings exactly as they are** — On Vimal, In flight, Where the
  product is. The mod matches them by name. Any other `##` heading is ignored along with its
  contents, which is how "The one problem" can sit here for a human reader without reaching
  the pane. `parse.test.ts` holds the naming; the extra-heading case was checked by running
  the shipped `parse()` against this file, because that test needs the `claude-code/testing`
  runtime and a session cannot run it.
- One line per bullet, short enough to read in a narrow pane. Detail belongs in
  `PROJECT_PLAN.md`; this file is a dashboard, not a record.
- Update it in the same commit as the work it describes. A stale dashboard is worse
  than none, because it is believed.
- Anything under **On Vimal** is blocking or near-blocking and nobody else can do it.

## On Vimal

- Nothing. The one-sentence problem came in on 2026-10-15 and is now CLAUDE.md's first section.
- Optional whenever you like: set `SUPPLY_PROVIDER=apify`. Safe now that counting is pinned to
  free Overture.

## The one problem

> **"I sell to small businesses but I can't find them anywhere easily."** — Vimal, 2026-10-15

Finding is the problem. The gap and the proof are what make the found list worth paying for.

**Effort tiers, 2026-10-16.** **DEW** (Do Extremely Well): search, lead quality. **GEW** (Good
Enough Works): ICP and its neighbours. **MIW** (Make It Work): loaders, delights, the game. The
tier is a ceiling too, so polishing a MIW thing is as wrong as half-doing a DEW one.

Both are CLAUDE.md §1–2, and together they are the cut every change is measured against.

## In flight

- Milestone 3, slice 3: one migration against the PRD shape, then the judge.
- Reordered 2026-10-16 by DEW: the headless fetcher fallback comes before judge polish, because
  it is the ceiling on lead quality rather than one item inside the milestone.

## Where the product is

- PRD v2 adopted 2026-10-15. Milestone 2 of 6 done, 3 in progress.
- **Testable now: `/app/find`** — two fields, a real count, five samples. No account.
- `/app` is still the old single-sentence search and still works. Replaced once milestone 3 reads.
- Pricing holds a 70% gross margin floor: bands 1/4/5, 3 reads a credit, 12 reviews a match.
- Counting is free Overture; only reading uses the paid provider. Apify keys set, not default.
- Built, not yet on a screen: `fit.ts` (blind rows, reveal), `rules.ts` (listing pre-filter).
- Built: supply for any US city, polite fetcher, contacts, credits, Stripe, CSV, opt-out.
- Production: live on `main`. Suite is **81 of 82 after `npm run build`**, 1 skipped; on a
  fresh clone with no build it is 79 of 82, 3 skipped. The skipped ones check nothing
  without a build or a local benchmark run, and each says which.
- Fixed 2026-10-19: `docs/PRICING.md` said 11 reads a credit for four days after the code
  moved to 3. Reached no customer copy. A test now holds the doc against `pricing.ts`.
- Cut 2026-10-15 for the one problem: "Contacted" out of the sidebar, the map link off results,
  the three "check a list you already have" prompts gone. Every route still works.
- **Fixed 2026-10-15, live for weeks:** "Not a fit, refunds the credit" refunded nothing, and
  contacted marks never reached the server. The tests were pointed at a dead file.
- Fixed with it: the CRM push was unreachable, linked only from a dead component.
- **The DEW ceiling: 20 of 48 production reads returned zero pages (42%, one metro, thin).** A
  judge handed zero pages can only say "couldn't tell", so lead quality cannot pass ~3 in 5
  candidates until the headless fallback exists. It outranks everything downstream of it.
- Closed as fine, not a deviation: no rising pool count. "Counting, ten seconds or so" is MIW
  satisfied, and a number before the scan lands would be invented.
- Not applied: migrations 0022/0023, superseded by one set written against the PRD.
