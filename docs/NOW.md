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

- Apify: token + `APIFY_ACTOR=compass~crawler-google-places`, leave `SUPPLY_PROVIDER` unset. Reviews cannot run without it.
- `RESEND_API_KEY` on Vercel. Needed for milestone 6, nothing before.
- Price per fit. Needs milestone 3's measured cost per Strong fit first.
- S0-16 hand-labelling: 142 labels across 2 markets, needs 3 x 100. Human work, gates precision.
- Gate item 1: does not pass as written. Proceed anyway, or spend on match rate first.

## In flight

- Milestone 1: apply the approved KEEP / HIDE / DELETE.

## Where the product is

- PRD v2 adopted 2026-10-15. Milestone 1 of 6.
- Built: supply for any US city, polite fetcher, contacts, credits, Stripe, CSV, opt-out.
- Built today: `fit.ts` — Strong/Maybe/No, blind rows, a credit buys a reveal.
- Provider chosen: Apify Compass, ~$10 a metro, on the vendors' own pricing.
- Production: live on `main`, suite 74/74.
- Known hole: 42% of reads return zero pages. The headless fallback is milestone 3.
- Not applied: migrations 0022/0023, superseded by one set written against the PRD.
