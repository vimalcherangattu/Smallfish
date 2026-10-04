# Brief — the GTM stream

Paste this into a fresh session. It assumes nothing except the repository.

---

You are the **GTM** stream for Small Fish. A second session owns Product — the
app at `/app`, the engine, the API and billing. Read `docs/STREAMS.md` first: it
says what you own, what you must not touch, and the one test that keeps the two
halves from contradicting each other.

## What the product is, and why the copy is hard

Small Fish finds local businesses by reading what their own websites say, proves
every match with a sentence off that site, says "couldn't tell" out loud when
the site does not settle it, and charges only for matches. The customer is a
small business selling to small businesses — a plumbing-software founder, not a
RevOps analyst.

The marketing problem is that **the product's entire argument is that it does
not overclaim.** Every figure on every page has to be one the repository can
produce. A page that rounds up is not a marketing decision here; it is the
competitor's pitch.

## What you own

`src/app/page.tsx`, `src/app/_handoff/`, `public/handoff/`,
`stage0/src/site/port_handoff.py`, the SEO and door routes
(`find`, `for`, `markets`, `compare`, `templates`, `why-it-exists`,
`how-we-check`, `benchmark`, `pricing`, `sample`, `waitlist`, `welcome`,
`sign-up`, `bot`, `opt-out`, `privacy`, `terms`, `list/[token]`), the marketing
components, `src/lib/{doors,launch,site,showcase,seller,saturation}.ts`, and the
`.mkt` rules in `src/app/globals.css`.

## How the home page is built — this is not an ordinary Next page

`src/app/page.tsx` renders **designer-authored HTML** through `HandoffPage`,
with `dangerouslySetInnerHTML`. The source is `src/app/_handoff/home.html` and
its stylesheet and script are `public/handoff/site.{css,js}`.

All three are **generated** by `python3 stage0/src/site/port_handoff.py <path-to-handoff>`.
That script is the real surface:

- `HREFS` maps the designer's placeholder links to real routes
- `REWRITES` rewrites forbidden coverage claims and **stops the port** on an
  unrecognised one
- `COPY_EDITS` carries the owner's exact-string edits and **fails if one no
  longer matches**, so a reworded revision cannot silently drop them
- `measured()` writes the real market figures into the demo reel from
  `public/data`
- `type_floor()` raises every sub-12px size for the phone

When a new designer handoff arrives, run the port rather than hand-editing the
HTML. When you hand-edit, you are editing the output and the next port will
overwrite you — add the change to `COPY_EDITS` instead.

Most recent home page change (2026-10-04, live): hero reads "Find the
businesses that…", the tickmarked bullets are gone, the explainer film is back
as its own `#watch` section, and slides 2 and 3 were rewritten.

## The numbers you may use

Only ones the repository computes. `stage0/tests/test_contract.mjs` and
`test_home_copy.mjs` both run against the **prerendered** HTML and will fail you
otherwise. Specifically:

- The **free allowance** must equal `PLANS.free.credits` in `src/lib/pricing.ts`
  (20 today). It is typed into `_handoff/home.html` in three places; if Product
  changes the plan, the test names every string to fix.
- The **demo reel** figures must equal the current `public/data` tallies.
  Regenerating that data is Product's job and does **not** update the reel —
  re-run the port.
- You may not sell a signal `src/lib/signals.ts` marks `provable: false` unless
  the refusal is in the same breath. `/templates` does this correctly: it names
  what it cannot settle and says "Not settled today".
- Three figures are banned by name because they were invented and shipped:
  `544`, `612`, and a clinic called `Maplewick`. They appear in design documents
  and in no data file.

## Known problems in your area

- **The home page's coverage reel ships 12 trades × 8 cities of invented market
  sizes.** This is a live overclaim on the page whose argument is that we do not
  overclaim. It needs either real figures or a different device. (Task #35.)
- The demo markets are three. Everything else on `/markets` and `/find` is
  generated from the same four measured markets.

## Decisions waiting on the owner

- **Gate item 1 does not pass as written** — open-data overlap clears 70% for
  veterinary alone. This constrains what the site can honestly claim about
  coverage in a new city. `docs/stage0-coverage-report.md` §7.
- The home page currently offers sign-up rather than the waitlist.
  `test_home_copy.mjs` enforces exactly one of the two, deliberately.

## What is next

`PROJECT_PLAN.md` task P2: SEO at volume, referral, attribution, the daily
control email. `src/lib/doors.ts` already carries door context through sign-up,
and `src/lib/launch.ts` the attribution.

## How to work

- `python3 stage0/tests/run_all.py` before you push. 58 files, all green today.
- Copy tests need a build: `npm run build` first, or they exit 2 rather than
  passing silently.
- Live checks need a server: `npx next start -p 3300`, then
  `node stage0/tests/check_<name>.mjs http://localhost:3300`. Chromium is at
  `/opt/pw-browsers/chromium`. `check_mobile` holds a 12px type floor and 44px
  targets at 390px; `check_motion` holds the scroll reveal.
- Push to `main` — both streams do, and `main` is production. The sequence is
  commit, fetch, rebase, run the suite, push, then **fetch the production URL
  and check what you shipped** — `docs/STREAMS.md` §3 spells it out, including
  why you must not pipe a git command into `tail` inside an `&&` chain. A rebase
  conflict is a stop, not a puzzle: say what conflicted rather than guess at the
  other session's intent. Push small and often.
- Do not edit the founding documents. They are live Claude Docs read through
  the connector, linked from `CLAUDE.md`. Leave a comment on the doc instead.

---

## Copy notes from the owner, 2026-10-04

Taken verbatim from a review of the live home page. These are the GTM session's
to act on; the Product session recorded them here and did not touch the copy.

1. **"Every email to the wrong business makes the next one less likely to
   land."** — *"Ye usp hai in a way, should be on top."* The owner reads this as
   the actual USP and wants it high on the page, not buried.

2. **"At 400 a month that is $79, and the ones that don't fit still cost
   nothing."** — *"iska matlab nahi samjha."* The price slider's sentence does
   not land. Note that the slab's numbers changed on 2026-10-04: the tiers now
   read 120 / 400 / 1,000 against `PLANS`, because the old 300 / 1,000 / 3,000
   promised 2.5× what the plans can deliver. The sentence may need rewriting
   around the corrected figures rather than the old ones.

3. **"Stop working from junk lists. Start with the businesses that need you."**
   — *"this can also be on top."*

4. **"Find the businesses that need what you sell."** — *"ye nikaal de. Useless
   hai. Doesn't ring a bell, mainstream lagg raha hai."* Cut it. The owner finds
   it generic — it is the line any lead-gen tool would write, which is the
   opposite of what the rest of the page is doing.

The shape implied by 1 and 3: lead with the **cost of getting it wrong**
(a wasted email damages the next one) and the **break from the status quo**
(junk lists), rather than with a category description of the product.

Both of those lines already exist on the page further down. This is a
reordering and a cut, not new copy — which also means `COPY_EDITS` in
`stage0/src/site/port_handoff.py` is where the change belongs, so the next
designer handoff keeps it.
