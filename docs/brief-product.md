# Brief — the Product stream

Paste this into a fresh session. It assumes nothing except the repository.

---

You are the **Product** stream for Small Fish. A second session owns GTM — the
home page, landing pages and everything a stranger sees before signing up. Read
`docs/STREAMS.md` first: it says what you own, what you must not touch, and the
one test that keeps the two halves from contradicting each other.

## What the product is

Small Fish finds local businesses by reading what their own websites say, proves
every match with evidence off that site, says "couldn't tell" out loud when the
site does not settle it, and charges only for matches. The customer is a small
business selling to small businesses — a plumbing-software founder, not a RevOps
analyst.

## What you own

`src/app/app/`, `src/app/account/`, `src/app/api/`, `src/components/app/`,
`public/app/kit.css`, most of `src/lib/`, and `stage0/src/{coverage,engine,benchmark}/`.

## Where things stand

`/app` was rebuilt on 2026-10-04 from `Smallfish_Product_Handoff.zip` — the
designer's nine artboards and their 14KB stylesheet, now `public/app/kit.css`.
The screens are: first run (one sentence, "I sell ___ to ___ in ___"), the
result with three tabs, the business row, couldn't-tell, the unread city,
nothing found, and three phone variants. `PRODUCT-HANDOFF.md` and its artboards
are not in the repository — ask for the zip if you need the originals.

Read `CLAUDE.md` for the engineering rules. The ones that bite hardest:

- **Absence needs positive proof.** A "no X" verdict requires the X-relevant
  pages were read and nothing was found. Missing evidence is "couldn't tell".
- **Two layers, and the general one is not optional.** Technology detection is
  a cheap optimisation over model judgment, never a precondition. Any criterion
  must produce a usable check plan with no catalogue at all.
- **Never blame the environment on the business.** Our proxy and network
  failures are ours, in the numbers and on the screen. `src/lib/unsure.ts`
  marks them `ours` and phrases them in the first person.
- **"every" is the one word this product cannot use.** 200 of 2,778 were read.

## What is blocked, and on whom

| | |
|---|---|
| `ANTHROPIC_API_KEY` | Not set by any path. `python3 stage0/src/engine/preflight.py` is the only honest check — do not hand-roll a curl, it was wrong for a session. Until it exists, no model judgment runs, which is why `needs_model` is the entire non-unread population of two of the four markets. |
| `CRON_SECRET` | Not set on Vercel, confirmed by probing the live endpoint. The worker has therefore never run on a schedule. |
| `RESEND_API_KEY` | Not set. Every mail records why it did not send. |
| Vercel Hobby | Crons are capped at once a day, and a faster expression **fails the build** — that froze production for three days. `vercel.json` is at `9 3 * * *`. |

## Decisions waiting on the owner — do not resolve these in code

1. **Gate item 1 does not pass as written.** Open-data overlap clears 70% for
   veterinary alone; HVAC is 31–48%. The costed gap-fill clears dental and HVAC
   cold and fails med spa at $0.059. `docs/stage0-coverage-report.md` §7.
2. **The §11 quote rule.** The handoff requires a verbatim quote on every `fit`
   row. `proof` is on all 51 `no_match` rows of dental Phoenix and none of the
   42 matches — structural, because you cannot quote the absence of a booking
   widget. An absence row currently shows the *search*; a presence row without a
   quote refuses to render. `src/lib/appview.ts` has the reasoning.
3. **Whether to charge for a match that arrives with no opening email.** About
   1 in 10 (`outcome: "thin"`), billable today.
4. **The scores-versus-verdicts fork.** `docs/design-system.md` §5 describes
   scores, tiers and weighted rubrics; the repo implements binary verdicts. Do
   not pick one silently.

## What is genuinely next

1. **S0-16 hand-labelling** — 142 labels across 2 markets, which preflight calls
   THIN. Gate item 2 (precision) cannot be measured until this is 3 × 100.
   Human work; recall is unmeasurable without the full true-match set.
2. **S0-03 Foursquare merge** — blocked on a free `HF_TOKEN`. The cheapest
   remaining lever on coverage, and it can only raise it.
3. **Re-run the benchmark** once an Anthropic key exists, to widen S0-17 past
   the three markets it has metered.

## How to work

- `python3 stage0/tests/run_all.py` before you push. 58 files, all green today.
- Seven checks need a live server: `npm run build && npx next start -p 3300`,
  then `node stage0/tests/check_<name>.mjs http://localhost:3300`. Chromium is
  at `/opt/pw-browsers/chromium`.
- `check_lure.mjs` and `check_claims.mjs` are new and guard two things that are
  invisible in source: one lure-filled pressable element per screen, and every
  number on screen being true of the thing it names.
- Push to `main` — both streams do, and `main` is production. Before every push:
  `git pull --rebase origin main`, then run the suite **after** the rebase, then
  push, then **fetch the production URL and check it**. A rebase conflict is a
  stop, not a puzzle: say what conflicted rather than guess at the other
  session's intent. Push small and often. See `docs/STREAMS.md` §3.
- When a measurement contradicts a document or an earlier measurement, **say so
  and record the retraction.** `docs/critique.md` and the decision log both
  carry reversals already. A plan that only accumulates confirmations is not
  being tested.
