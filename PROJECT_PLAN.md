# Small Fish — Project Plan

The single source of truth for what is being built, in what order, and what must be true
before moving on. The founding documents are **live Claude Docs**, linked from
`CLAUDE.md` and read through the Claude Docs connector; the review that reshaped this plan
is `docs/critique.md`.

Strategy lives in those docs. Numbers and decisions live here. Where they disagree, this
plan wins and the Decision log records why.

**Last updated:** 2026-09-21 · **Stage:** 0 — Prove it (**gate item 1 fails for HVAC**, see Decision log)

---

## How to use this plan

- Every task has an ID (`S0-01`), an owner, and a definition of done. Tick the box only
  when the definition of done is met, not when the work feels finished.
- **Gates are hard.** A stage does not start because the previous one ran out of calendar;
  it starts because the gate passed. A failed gate is a decision point, not a delay.
- Numbers in this plan are *targets to be replaced by measurements*. When a real number
  arrives, edit the plan and note it in the Decision log.
- Anything that deliberately contradicts a founding document is listed in **Changes from
  the founding documents** with the reason. Raise it as a comment on the doc too — the
  docs are not edited from here.

## Status dashboard

| Stage | Status | Gate | Gate met? |
|---|---|---|---|
| 0 · Prove it | **In progress** | Coverage ≥ 70% and precision ≥ 90% on 3 niches | items 1+4 answered; **2+3 need S0-16** |
| 1 · Launch | Not started | 50 paying users; live precision ≥ 90% | — |
| 2 · Grow | Not started | 300 paying; churn ≤ 6%; cost/match ≤ $0.04 | — |
| 3 · Compound | Not started | 1,000 paying; ≥ 50% warm reads | — |
| 4 · Relevance layer | Not started | — | — |

### Live numbers (replace targets with measurements as they arrive)

| Metric | Target | Measured | Date |
|---|---|---|---|
| Open-data candidates per metro niche | — | 2,435–3,126 | 2026-09-19 |
| Candidates with a website | — | 82.7–93.1% | 2026-09-19 |
| **Open-data coverage vs Google** — overlap, not count (S0-04) | ≥ 70% | **veterinary 73.1–86.0% ✓ · dental 63.8–94.3% ? · med spa 45.4–79.3% ? · HVAC 31.1–47.8% ✗** | 2026-09-21 |
| — Google places sampled, 240 cells over 4 metros | — | 884 on-niche (158 off-niche dropped) | 2026-09-21 |
| — ambiguous: Overture has *a* business at the spot, name unreconcilable | — | 252 of 884 (28.5%) | 2026-09-21 |
| **Genuine couldn't-tell** (reachable, still unjudgeable) | ≤ 25% | **19.0–25.3%** ✓ | 2026-09-20 |
| — blocked (403/429), reported separately | — | 13.7–20.5% | 2026-09-20 |
| — no site / social-only, reported separately | — | 0.0–5.5% | 2026-09-20 |
| — bot-blocked recoverable, honest strategies | — | **3.8%** (75/78 stay blocked) | 2026-09-19 |
| Judgeable (timeouts excluded as ours) | — | 56.6–66.7% | 2026-09-20 |
| Booking signal found, judgeable sites | — | 39.3–63.3% | 2026-09-20 |
| — vendor-identified, vet market | — | 2 → **21** after per-niche catalogues | 2026-09-20 |
| Booking found only beyond the homepage | — | 0.0–1.6% | 2026-09-19 |
| **Criteria settled with no model call** (the cost lever, S0-10) | measure | **56.0–57.4%** where a detector exists | 2026-09-20 |
| — across every criterion, detector or not | — | **25.0%** (285 of 1,138) | 2026-09-20 |
| — benchmark criteria with no detector at all | — | **4 of 7**, settling nothing | 2026-09-20 |
| Match precision, blended | ≥ 90% | — | — |
| Match precision, absence criteria only | ≥ 90% | — | — |
| Known-match recall | ≥ 60% | — | — |
| Cold cost per business | ≤ $0.010 | **$0.0011–0.0020 measured** (S0-17, 120 businesses, Haiku 4.5) ✓ | 2026-09-21 |
| Warm cost per business | ≤ $0.002 | — | — |
| **Blended cost per match** | ≤ $0.04 | **$0.033 measured** (dental, whole-business matches) · $0.012–0.029 modelled with gap-fill ✓ | 2026-09-21 |
| — Google gap-fill discovery, measured | — | **$0.0079 per business discovered** | 2026-09-21 |
| — break-even cold read cost, worst market | — | $0.0043/business — **measured read is $0.0020, inside it** | 2026-09-21 |
| Proof validity (quote found verbatim in fetched text) | high | **100%** (11 of 11 model verdicts) | 2026-09-21 |
| Couldn't-tell on **readable** sites, live run | ≤ 25% | **38.9%** (dental) ✗ — worse than the probe-based 19–25% | 2026-09-21 |
| Weekly profile change rate (drives alert cost) | measure | — | — |
| p95 time to first match, cold market | measure | — | — |

✓ **The ≤25% couldn't-tell target stands, and the earlier "unreachable" verdict is
retracted.** It looked unreachable because one number counted three different answers:
blocked sites, businesses with no site, and genuine uncertainty. Split apart, genuine
uncertainty is 19.0–25.3%. See `docs/stage0-coverage-report.md` §2b and §2c.

---

## Changes from the founding documents

These are deliberate departures, each traced to a finding in `docs/critique.md`.

| # | Change | Why |
|---|---|---|
| 1 | **Coverage is measured before precision.** Stage 0 starts with open-data coverage, not the accuracy benchmark. | Critique 4 — coverage is cheaper, faster, and can invalidate the plan before any model spend. |
| 2 | **Precision is reported per criterion type**, and absence criteria are over-weighted in the benchmark. | Critique 3 — a blended 90% can hide a failing absence number, and absence is what the marketing leads with. |
| 3 | **Known-match recall becomes a launch-blocking metric.** | Critique 9 — precision alone does not protect the demo. |
| 4 | **Alert cost is modelled and budgeted; saved searches are capped by candidate volume.** | Critique 1 — weekly re-runs are an unpriced liability that scales with retention. |
| 5 | **Gross margin is stated without breakage.** | Critique 2 — retention and breakage are in conflict. |
| 6 | **Day-90 MRR target restated to $4–4.5K at 100 paying users.** | Critique 6 — $7K implies a mature plan mix the beachhead cannot produce. |
| 7 | **Cold email planned at a 1.5% positive reply rate**, with communities rebalanced upward. | Critique 7 — 3% to agencies is optimistic and the plan should survive the miss. |
| 8 | **Programmatic SEO saturates few niches × metros deeply instead of 3,000 thin pages.** | Critique 5 + 13 — the spray conflicts with cost control and with the moat. |
| 9 | **Launch with 6 automations, not 22.** | Critique 12 — premature ops load on a solo founder. |
| 10 | **Internal API exists from week 5** (not months 6–18) because GTM channel 4 depends on it; the *public* API still ships at Stage 3. | Critique 10 — the three documents disagreed. |
| 11 | **Cold-market UX is a designed state**, and time-to-first-match is a tracked metric. | Critique 8 — at launch every market is cold. |
| 12 | **Referral bonus requires a card on file and pays on first paid event.** | Critique 11 — the current design prints free matches. |
| 13 | **ICP discovery added as a second front door** (S1-22 – S1-26). | Every flow in the product document assumes a user who can already name their vertical, geography and gap; the research describes a buyer who cannot. It also shares an implementation with GTM automation A2, so it is far cheaper than it looks. `docs/icp-discovery.md`. |
| 14 | **Check plans derived from the search's own criteria, not a fixed keyword list** (S0-32). | The technology catalogue is vertical-specific by nature. Building on it alone would make Small Fish a booking-widget detector rather than a relevance engine. Measured: an uncatalogued vertical (vets) scored best of four markets on judgeability. |

---

## Stage 0 — Prove it

**Goal.** Establish, with measurements rather than estimates, that Small Fish can find the
candidates, judge them accurately, and do both for less than it charges.

**Gate to Stage 1.** All four must hold on three real niche searches:

1. Open-data **overlap** ≥ 70% of Google's places per niche (or a costed gap-fill plan
   that keeps blended cost per match ≤ $0.04). *Restated from "count" — Google's API
   caps at 60 results and cannot yield a count; see the Decision log, 2026-09-21.*
   **Measured: fails for HVAC on every reading, passes for veterinary, undecided for
   med spa and dental.**
2. Blended match precision ≥ 90% **and** absence-criterion precision ≥ 90%.
3. Known-match recall ≥ 60%.
4. Measured blended cost per match ≤ $0.04.

If (2) fails on absence criteria only, narrow to the niches and criteria where Small Fish
wins rather than abandoning — that is the response the founding documents already chose.

### S0.A — Coverage (runs first, no model spend)

- [x] **S0-01 · Choose benchmark markets and niches.** Med spas (Dallas), dental clinics
  (Phoenix), HVAC (Tampa), in `stage0/fixtures/benchmarks.json`. Category values are real
  Overture values discovered by scanning the release, not guessed.
- [x] **S0-02 · Pull Overture Places for each market.** `overture_extract.py` reads the
  public parquet release over HTTPS with DuckDB; bbox row-group pruning makes a
  metro-sized query take 6–10s against 10.5 GB. Results: 3,009 / 3,126 / 2,435 candidates.
- [ ] **S0-03 · Pull Foursquare OS Places for each market** and dedupe against Overture by
  domain, phone and address proximity. **Blocked, and not the way the research assumed.**
  Foursquare OS Places is still Apache-2.0, but distribution moved to Hugging Face and the
  dataset is now `gated: auto` — it needs a free HF account that has accepted the terms,
  and a token. The public S3 bucket `fsq-os-places-us-east-1` now contains only
  `LICENSE.txt` and `NOTICE.txt`. *Unblock:* a `HF_TOKEN` in the environment. *Worth it
  because:* Foursquare claims 106M+ places against Overture's 72M+, so it is the cheapest
  remaining way to raise candidate coverage without paying Google.
- [x] **S0-04 · Establish the Google baseline.** `coverage/google_baseline.py`. Not the
  count the task originally asked for — Google's API cannot produce one — but the overlap
  it should always have asked for. 240 cells across four metros, stratified into cells
  where Overture has businesses and cells where it has none, results filtered to the
  niche by returned `primaryType`, matched against Overture by distance and name, and
  reported as a **band** because 28.5% of Google places sit where Overture has a business
  under an unreconcilable name. Place IDs and verdicts are all that reach disk, as
  Google's terms require. **Result: veterinary passes, HVAC fails on every reading, med
  spa and dental are undecided.** $8.22 of API spend.
- [x] **S0-05 · Measure website presence and readability.** `site_probe.py`, 200 sites per
  market, homepage plus 3 link-selected pages, robots-respecting and throttled.
  **Judgeable 56.9–60.4%, so the couldn't-tell floor is ~40%.** Largest addressable
  bucket is bot-blocking (403/429) at 11–17%.
- [ ] **S0-06 · Write the coverage report** with the gap-fill cost implication per niche.
  *Partial:* `docs/stage0-coverage-report.md` covers supply and readability; the Google
  baseline is missing, so **gate item 1 is still unanswered**. Blocked on S0-04.
- [x] **S0-26 · Test what recovers bot-blocked sites.** Five strategies against all 78
  blocked hosts. **96.2% stay blocked under every honest strategy**; complete browser
  headers and HTTP/2 recover nothing, patience recovers nothing. Presenting as Chrome —
  measured only, to price principle 7 — got past 5 walls, but 4 landed in JS shells, so
  exactly 1 site in 78 became readable by abandoning honest identification. **The
  principle stays and bot-blocking is reclassified from workstream to cost of doing
  business.**
- [x] **S0-30 · Keep the cheap, correct parts of polite crawling** even though they buy no
  recovery. `Retry-After` honoured on 429/503, exponential per-host backoff, and a crawler
  identity page at `/bot` — the URL in the user agent, which until now was
  `smallfish.example/bot` and **did not exist**. S0-26 measured that honest identification
  costs one readable site in 78; a URL nobody can open spends that price and buys nothing.
  The page states what is fetched, the real per-host delay, how to block us, and how to
  have a business removed. 12 tests pin the page to the probe's actual behaviour, because
  the failure is silent: the crawler keeps working while the identity it advertises rots.
  Contact is `getsmallfish@gmail.com`, a real inbox — the page offers it as the route to
  have a business removed, so a bouncing address would be worse than offering none.
- [x] **S0-31 · Give "blocked" its own user-facing status.** Wired through the exporter,
  the types, the results list and the map. Not billable, like every non-match.
- [x] **S0-27 · Restate the couldn't-tell target from measured data.** Done, and the
  answer is that the product document was right all along. Blocked (13.7–20.5%) and
  no-site (0.0–5.5%) are separate answers, not uncertainty; genuine couldn't-tell is
  **19.0–25.3%**. The ≤25% target is kept, now measured against the thing it names, with
  ≤15% by year 1. `couldnt_tell_target.py` reports all three definitions.
- [x] **S0-32 · Criteria-driven check plans.** `engine/check_plan.py` derives what pages
  to read from the search's own criteria, so any vertical works with no catalogue.
  Recognised criteria additionally get technology families as an *optimisation*, never a
  precondition; absence criteria are never settleable without a model. Validated on vet
  clinics in Columbus — a vertical sharing no vendors or keywords with the other three —
  which scored **65.5% judgeable, the best of four markets**, with only 2 of 22 booking
  detections matching a known vendor. 12 tests in `stage0/tests/test_check_plan.py`.
- [x] **S0-28 · Per-niche booking detector catalogues.** 43 vendors across veterinary,
  dental, med spa and trades. Vet vendor-identified detections went 2 → 21 and the booking
  signal rate 26.2% → 39.3% on identical sites. Read as a correction rather than a win:
  med spa matches fell 35 → 26 and dental 58 → 42, because those were false matches on
  booking we could not previously see.
- [ ] ~~**S0-28 (original wording)** · Per-niche booking detector catalogues.~~ Vendor concentration within a
  niche is high (Vagaro/Boulevard/Square for med spas; NexHealth/Dentrix for dental;
  ServiceTitan/HousecallPro/Jobber for HVAC), so a short per-niche list covers most of the
  market. This is the cheapest precision available. *Done when:* catalogues exist and the
  detected share is re-measured.

### S0.B — Engine

- [ ] **S0-07 · Search parser.** Plain English → location geometry, categories, must-have
  and must-not-have criteria, plus a per-criterion check plan (what proves it, what
  disproves it, which pages to read).
- [x] **S0-29 · Geometry module.** `engine/geometry.py` resolves all five shapes — radius,
  city, county, state and drawn polygon — through one interface, each returning candidates
  and a pre-spend count. Radius uses bbox pruning plus exact haversine; polygons and
  divisions use bbox pruning plus `ST_Within`. Boundaries come from Overture Divisions
  (same release as places, no new data source) and are cached after first lookup.
  Cross-validates: the 25-mile radius returns 3,009, matching `overture_extract.py`
  exactly. **A Texas-wide search is 14,789 candidates ≈ $148 of cold reads on a $79/month
  plan** — see S1-21.
- [ ] **S0-08 · Polite fetcher.** robots.txt honoured, identified user agent, per-domain
  throttling, homepage plus up to three check-plan-selected pages, conditional requests and
  content hashing for the change check.
- [ ] **S0-09 · Headless rendering fallback**, triggered only when a plain fetch returns an
  empty shell, with a per-search cap.
- [x] **S0-10 · Technology detector.** 79 vendors across booking, chat, CMS and quote
  forms, with per-niche catalogues (S0-28). **The share is recorded:
  `engine/detection_share.py` — 56.0–57.4% of criteria settled with no model call where a
  detector exists, 25.0% across every criterion in every market.** The gap is the point:
  four of seven benchmark criteria have no detector at all, and they settle nothing.
  *Read with gate item 2, never alone:* this is the share answered without spending, not
  the share answered correctly, and absence matches from detection alone are exactly what
  that gate tests. A high share here with a low precision there is worse than a low share.
- [ ] **S0-11 · Fact profile extraction.** One model pass per business → services,
  specialties, booking method, contact routes, staff count, locations, languages, ownership
  hints, and quotes with source URLs. Store the profile, never full page copies.
- [ ] **S0-12 · Criteria judge.** Cheap signals first, then a small model, with a stronger
  model on borderline cases and a random audit sample. Returns verdict, proof quote,
  confidence word.
- [x] **S0-13 · Absence-proof rule.** `engine/absence.py`. A "no X" verdict requires the
  X-relevant pages to have been read, something competent to have looked, and nothing to
  have been found. Defaults to couldn't tell on every other path. 15 tests in
  `stage0/tests/test_absence.py`, including an exhaustive sweep of the decision space
  asserting no input reaches MATCH without relevant pages read — a bug here produces a
  confident false match, which is the one failure that destroys trust *and* gets billed.
- [ ] **S0-14 · Proof validator.** Every quote is verified verbatim on its linked page
  before display; failures become couldn't tell. *Done when:* proof validity is 100% on the
  benchmark set.
- [ ] **S0-15 · Cost meter.** Per-business tokens, model, pages fetched, rendering used,
  cold or warm — logged for every run. *Done when:* a run prints real cost per business and
  per match.

### S0.C — Benchmark

- [ ] **S0-16 · Hand-label the benchmark set.** 3 searches × 100 businesses, labelled by a
  human, including the full true-match set so recall is measurable. Over-weight absence
  criteria per Change 2.
- [ ] **S0-17 · Benchmark harness.** Runs the engine over the labelled set and reports
  precision (blended and per criterion type), recall, couldn't-tell rate, proof validity,
  and cost. *Preflight exists* — `engine/preflight.py` answers "can the benchmark run?"
  in one command and exits non-zero until it can. On 2026-09-19 it reports **8 blockers**:
  both credentials, plus S0-08, S0-11, S0-12, S0-14 and S0-16 unbuilt. The benchmark is
  five tasks away from a number, not one command.
- [ ] **S0-18 · Regression gate in CI.** Any prompt, model or extraction change re-runs the
  benchmark; a precision drop > 1 point fails the build.
- [ ] **S0-19 · Competitor side-by-side.** Same searches through Scrap.io and Exa Websets:
  rows returned, true matches, cost per true match. *Blocked on:* trial accounts.
- [ ] **S0-20 · Measure the weekly change rate** on the benchmark set — re-fetch after 7
  days and count changed profiles. Feeds the alert cost model (Change 4).
- [ ] **S0-21 · Publish the benchmark page.** Precision and couldn't-tell per niche, method
  shown. This is the launch story.

### S0.D — Economics

- [ ] **S0-22 · Rebuild the unit-economics model from measured inputs**, with margin stated
  *without* breakage. *Done when:* the model consumes S0-15 output and prints margin per
  plan at measured match rates.
- [ ] **S0-23 · Model the alert engine cost** from S0-20 and set per-plan saved-search
  candidate budgets.
- [ ] **S0-24 · Re-budget GTM model spend** at the real page target (Change 8).
- [ ] **S0-25 · Decide pricing** against measured costs: confirm or revise the $29/$79/$199
  tiers, the 2× rare-search rule, and allowances.

---

## Stage 1 — Launch

**Gate to Stage 2.** 50 paying users; live precision holds ≥ 90%.

Features 1–6 from the product document, plus the corrections above.

### Product

- [x] **S1-01 · Search box and criteria confirmation.** `src/lib/search.ts` parses a typed
  query into where / what / must-have / must-not-have / preferences, and the confirm step
  answers all eight situations the product document's *Search problems* table names —
  before anything is counted, which is the point: a criterion the engine cannot settle is
  cheapest to refuse while the user is still typing. Vague words get one multiple-choice
  question whose options are all observable or "drop it". Unprovable criteria are refused
  with a provable proxy, and the proxy says when it is not settleable today either.
  People searches and owner-attribute criteria are declined outright. Contradictions and
  the five-criterion cap block the count rather than warning about it, and a match rate
  under 3% of the judged candidates warns before unlocking. Criteria the catalogue does
  not cover still become criteria — the general layer — flagged as needing a model.
  *Deferred to S0-12:* a model reading the query. The parser says `unrecognised` rather
  than guessing, and being deterministic has one real advantage a model does not offer:
  the confirm step is the contract, so two identical searches must not word it
  differently.
- [x] **S1-20 · Map region picker.** Built. Radius presets, click to move the centre,
  freehand polygon drawing, live candidate count as the region changes. MapLibre +
  OpenStreetMap, so no map API key and no billing. Browser geometry in `src/lib/geo.ts`
  mirrors `engine/geometry.py`, so the count on screen matches what the engine would
  return.
- [x] ~~**S1-20 (original wording)** · Map region picker.~~ The visual half of S0-29: a map that opens on the
  parsed location, a draggable radius, presets for city, county and state, and freehand
  polygon drawing. Shows the live candidate count as the region changes, because the
  region is what drives cost — this is the screen where a user can casually draw half a
  state and create a 20,000-candidate scan. *Depends on:* S0-29.
- [ ] **S1-22 · ICP discovery — read the seller's own site.** Point the existing fetcher
  and extraction at the user's URL to get what they sell, who they serve, their problem
  language and their geography. Shares its implementation with GTM automation A2, which
  needs the same capability aimed at prospects. Design: `docs/icp-discovery.md`.
  *Blocked on:* `ANTHROPIC_API_KEY`. The rest of the flow (S1-23 – S1-26) is built and
  runs on a typed description instead, so this upgrades the input without touching
  anything downstream.
- [x] **S1-23 · ICP inference.** Built on a *described* offer rather than a fetched one,
  because S1-22 needs a model key. `src/lib/icp.ts` reads a free-text description for
  observable signals and splits them in two: provable signals become proposed criteria,
  unprovable ones come back in `refused` with what it would take to settle them, and are
  never proposed. Both halves are shown. The named-offer chips are an optimisation over
  the free-text path, never a precondition — same two-layer rule as `check_plan.py`.
  *Does not depend on:* S1-22, which upgrades the input and changes nothing downstream.
- [x] **S1-24 · Candidate ICPs with live counts**, side by side, free. Real tallies from
  `public/data/index.json`, which now carries each market's criteria and counts (~1 KB
  each) so three numbers cost 4 KB instead of four megabytes. Counts are presented as a
  floor, not a total, because only ~200 sites per market have been read. The account gate
  and the one-free-count-not-three rule land with S1-08.
- [x] **S1-25 · Hand off to the normal search.** The chosen ICP sets the market and the
  criterion and closes; from there it is an ordinary search. No parallel system, and
  nothing downstream is told where it came from.
- [x] **S1-26 · ICP discovery as the rare-search empty state.** A criterion with zero
  matches in the current region offers the flow instead of an empty list. The region is
  never widened silently to make the number look better — `docs/icp-discovery.md` open
  question 3, answered the honest way.
- [x] **S1-27 · Outreach note, icebreaker and likely pain point per lead.** `src/lib/
  outreach.ts`, shown in the result detail panel with a copy button and exported as four
  CSV columns. Derived from observed evidence only — no model runs, and the evidence each
  sentence rests on travels with it in `basis`. It refuses far more than it writes: no
  note for an unread site, an unreadable one, a business with no matched criterion, or a
  gap the signal catalogue has no consequence for. `withheld` says which, and goes in its
  own CSV column so a "not written: …" line can never be mail-merged into an email. When
  a model does run it should *rewrite* these sentences, not add claims.
- [x] **S1-21 · Area cost guardrail.** The scan cost for the current region is shown
  before anything is spent, split into unread and cached, with the warm-market figure
  alongside. Warns above 5,000 candidates.
- [ ] ~~**S1-21 (original wording)** · Area cost guardrail.~~ When a region's candidate estimate exceeds the scan
  budget, say so before anything is spent: show the estimate, offer to tighten the region,
  and make progressive unlock (strongest matches first, stop any time) the default for
  large areas. The product document promises this behaviour for huge areas but ties it to
  no UI. *Depends on:* S1-20.
- [ ] **S1-02 · Free match count** from a sample, streaming and tightening, with three
  proven samples shown free. Anonymous limits set from the S0 cost model, not from the
  founding document's 5/day (Critique 5).
- [ ] **S1-03 · Cold-market UX** (Change 11): streamed partial counts, a fast path to the
  first three matches, and an honest "reading this market, we'll email you" state.
- [ ] **S1-04 · Results table with proof**, three statuses, side panel per criterion, and
  one-click wrong-result reporting with automatic refund.
- [ ] **S1-05 · Published contacts** — website, phone, public email, contact form, socials,
  each with provenance. Nothing invented.
- [x] **S1-06 · Export to CSV with proof columns.** Every row carries, per criterion, the
  verdict, the evidence and the one-line "how this is checked", plus a `why_it_matched`
  sentence usable in a cold email as written, and a `billable` column so the pricing
  promise is visible in the file itself. Non-matches export too, with their reason —
  "this site blocks automated reading" is worth more to the user than a silently dropped
  row. 10 tests cover the quoting, because a CSV bug does not raise, it silently shifts
  every column of someone's spreadsheet.
- [ ] **S1-06b · Google Sheets export and duplicate protection.** Needs accounts, so it
  follows S1-08.
- [ ] **S1-07 · Saved searches and alerts**, with the candidate-volume budget from S0-23
  enforced.
- [ ] **S1-08 · Accounts, billing and plans** (Free, Starter, Growth) plus packs, on Stripe.
- [ ] **S1-09 · Business opt-out flow** — public form, ownership verification via listed
  domain or phone, suppression within 7 days, with honest wording about already-exported
  rows (Critique, smaller notes).
- [ ] **S1-10 · Internal API** (Change 10) — search, count, unlock — so GTM automations and
  the n8n/Make templates have something to call.
- [ ] **S1-11 · Event instrumentation** per the GTM event model, into PostHog and one
  warehouse table.

### Go-to-market

- [ ] **S1-12 · 20 design partners** recruited and active.
- [ ] **S1-13 · Saturation set defined** (Change 8): the specific niches × metros the
  knowledge base fills first. Everything else waits.
- [ ] **S1-14 · Programmatic pages for the saturation set only**, each gated on ≥ 20
  matches and a passing sample precision check.
- [ ] **S1-15 · Comparison pages** — Scrap.io, Outscraper, D7.
- [ ] **S1-16 · Six automations live**: A1–A4 dogfood loop, A5 page generation, B2
  stuck-at-count nudge, C1 alerts (Change 9).
- [ ] **S1-17 · Cold email at 50/day**, planned against a 1.5% positive reply rate
  (Change 7).
- [ ] **S1-18 · Community and creator programme** — the rebalanced primary channel.
- [ ] **S1-19 · Launch week** — Product Hunt, Show HN on the benchmark method, waitlist
  email, founder pricing for the first 200 paid users.

### Revised day-90 targets (Change 6)

| Metric | Day 30 | Day 60 | Day 90 |
|---|---|---|---|
| Free sign-ups | 300 | 900 | 2,000 |
| Paying users | 15 | 50 | 100 |
| MRR | $600 | $2,200 | **$4,000–4,500** |
| Programmatic pages (saturation set) | 100 | 300 | 600 |
| Live match precision | ≥ 90% | ≥ 90% | ≥ 90% |

---

## Stage 2 — Grow

**Gate to Stage 3.** 300 paying users; churn ≤ 6%; blended cost per match ≤ $0.04.

- [ ] **S2-01 · Templates library** with public SEO pages showing live counts.
- [ ] **S2-02 · Integrations** — HubSpot, Instantly, Smartlead, webhook.
- [ ] **S2-03 · Agency plan and workspaces**, shared credit pool, white-label exports.
- [ ] **S2-04 · Published benchmark page kept current**, updated monthly.
- [ ] **S2-05 · UK and Canada coverage**, coverage-measured first per Change 1.
- [ ] **S2-06 · Lifecycle automations B1–B6 and C1–C5** once volume justifies them.
- [ ] **S2-07 · Pricing experiments** — Starter $29 vs $39; free plan 25 vs 10; rare-search
  2× vs an add-on.
- [ ] **S2-08 · Referral programme** with the card-on-file guard (Change 12).

## Stage 3 — Compound

**Gate to Stage 4.** 1,000 paying users; ≥ 50% of reads served warm.

- [ ] **S3-01 · Public API and MCP server.**
- [ ] **S3-02 · Change alerts** — "added booking", "new location".
- [ ] **S3-03 · Knowledge base saturation** across the top metros in core niches, following
  the sequence from S1-13 rather than spraying.
- [ ] **S3-04 · Australia coverage.**

## Stage 4 — The relevance layer

- [ ] **S4-01 · CRM and sender integrations that call relevance on demand.**
- [ ] **S4-02 · Partner marketplace listings.**
- [ ] **S4-03 · Data licensing of derived facts.**

---

## Not building (kept from the founding documents)

Email sending, a CRM or sequencer, contact databases of individuals, volume scraping,
firmographic data on large companies. Each pulls toward commodity competition.

## Risk register

Carried from the founding documents, with the critique's additions marked **new**.

| Risk | Early warning | Response |
|---|---|---|
| Accuracy not clearly better than Exa or Scrap.io | S0-19 side-by-side | Do not launch; narrow to winning niches |
| Open data misses too many small businesses | S0-06 coverage < 70% | Costed Places gap-fill; re-check margin; niche-by-niche go/no-go |
| **Absence-criterion precision fails while blended passes** (new) | S0-17 per-criterion report | Narrow launch criteria to provable ones; invest in the absence-proof rule |
| **Alert costs scale with retention** (new) | S0-20, then monthly cost report | Candidate-volume budgets per plan; longer default cycles |
| **Cold-market latency kills first impressions** (new) | p95 time-to-first-match | Cold-market UX; pre-warm the saturation set before promoting it |
| Blended cost per match above $0.05 | Monthly cost report | Raise prices or trim allowances before scaling acquisition |
| Scrap.io or Exa ships local AI criteria | Competitor changelogs | Published benchmarks; proof UX; pay-per-match |
| Cold email deliverability collapses | Bounce > 3% | Lower volume, rotate inboxes, lean on communities |
| Low-price churn | Monthly churn > 8% | Saved searches, annual plans, Agency tier |

## Open questions

Carried forward; each is assigned to the task that answers it.

| Question | Answered by |
|---|---|
| Precision and cost per business on the first 3 benchmark searches | S0-17 |
| Open-data coverage vs Google Maps in the first 3 niches | S0-06 |
| Share of local businesses with a website readable enough to judge | S0-05 |
| Weekly rate at which profiles change | S0-20 |
| Do buyers accept the rare-search 2× rule shown up front? | S1 interviews |
| Is 25 free matches the right hook, or does it attract list farmers? | S2-07 |
| Which 5 templates drive the most first searches? | S2-01 |
| What do buyers pay per matched lead? | 10 customer interviews, pre-launch |

## Decision log

| Date | Decision | Rationale |
|---|---|---|
| 2026-09-19 | Stage 0 runs coverage before precision | `docs/critique.md` §4 |
| 2026-09-19 | Day-90 MRR restated to $4–4.5K | `docs/critique.md` §6 |
| 2026-09-19 | Launch with 6 automations, not 22 | `docs/critique.md` §12 |
| 2026-09-19 | ~~Source documents kept as PDFs of record in `docs/source/`~~ **Superseded:** the founding documents are live Claude Docs, read through the connector and linked from `CLAUDE.md`. The PDF snapshots are removed; git history at `79fe6cb` holds the 2026-09-19 versions the critique was written against. | A snapshot in the repo goes stale the moment a doc is edited, which is the failure the PDFs were meant to avoid. The connector reads the current version. |
| 2026-09-19 | Critique finding 3 (absence criteria need deep crawls) **downgraded** | Measured: booking signals appear only beyond the homepage in 0–1.6% of cases. Concern stands only for booking with no vendor fingerprint, which S0-16 must find. |
| 2026-09-19 | Couldn't-tell ≤25% declared unreachable as written | Measured floor of ~40% before any judgment. S0-26 attacks it, S0-27 restates it. |
| 2026-09-19 | Map region selection promoted from a half-sentence to explicit scope (S0-29, S1-20, S1-21) | It was named in the product document but had no tasks, no UI detail and no cost treatment, while being the main driver of scan cost. |
| 2026-09-19 | Bot-blocking reclassified from workstream to cost of doing business; the critique's "most addressable" claim **retracted** | Measured: 96.2% stay blocked under every honest strategy. Presenting as a browser recovers 1 readable site in 78 — not a trade worth making. |
| 2026-09-19 | Restating the couldn't-tell target (S0-27) becomes the primary response to the ~40% floor | The recovery route it was meant to back up has been refuted. |
| 2026-09-19 | `CLAUDE.md`'s account of how API keys arrive **retracted in part** | Measured: `api.anthropic.com` is on the agent proxy's `noProxy` list, so no credential can be attached at egress on that path, and the prescribed 401 curl returns 401 whether or not a credential exists — an unfalsifiable probe. A `GOOGLE_PLACES_API_KEY` *is* in the environment, contradicting "there is none and there should not be". |
| 2026-09-19 | SDK-vs-proxy question **closed**: `engine/llm.py` keeps the ordinary SDK path | Tested four ways. An `x-api-key: placeholder` returns `invalid x-api-key`, proving the header reaches Anthropic unmodified — the proxy neither injects nor replaces. A real `ANTHROPIC_API_KEY` in the environment is the only mechanism observed to work here. |
| 2026-09-19 | Credential verification becomes a tested script, not a pasted curl | The hand-rolled probe was wrong for a session and read as "this session predates the credential" when it meant nothing at all. `engine/preflight.py` distinguishes the five states that have different remedies, and 12 tests pin the classification. |
| 2026-09-19 | S0-04 blocker restated from "needs a key" to "needs the API enabled" | The key is present and valid; Places API (New) is not enabled on project `74590284143`. Different owner, different fix. |
| 2026-09-20 | **Product build started before the Stage 0 gate passed.** | A deliberate departure. The remaining gate items are externally blocked, and the search box, region picker and results table are needed whatever precision turns out to be. What the gate still protects is *spending on acquisition*, not building. Model-dependent parts stay behind an interface so the engine drops in when keys land. |
| 2026-09-20 | **"The couldn't-tell target is unreachable" — retracted.** | The ~40% figure counted blocked sites, businesses with no website, and genuine uncertainty as one number, and part of it was our own crawler timing out. Genuine uncertainty is 19.0–25.3%; the product document's ≤25% stands. Second time measurement has corrected the critique. |
| 2026-09-20 | **Timeouts reclassified as ours, not the business's** | Three crawls of identical sites gave 4, 20 then 48 timeouts on one market while every other outcome moved by ≤4, and a retry made it worse. Excluded from business-facing rates and reported as crawl quality. Carries a product warning: weekly alert re-crawls need rate discipline and their own quality metric. |
| 2026-09-20 | Earlier match rates of 37–63% were **too high** | Better booking detection cut med spa matches 35 → 26 and dental 58 → 42. Those were false matches on booking the detector could not see — the exact failure the coverage report cautioned about. |
| 2026-09-20 | PMM Foundations lists Foursquare OS Places as "Free" with no caveat — **partly outdated** | Still Apache-2.0, but distribution moved to Hugging Face behind `gated: auto`, and the public S3 bucket is now empty of data. A free account and token are required, so "free" is true of the licence and not of the access. |
| 2026-09-20 | The app serves **measured data only** | 8,974 real businesses and 720 real site probes, with verdicts from the absence-proof rule. Unread and not-yet-judged are shown as themselves rather than hidden, so the cold-market state the product document glosses over is visible: 200 of 3,009 read in the flagship market. |
| 2026-09-20 | **Model-dependent Stage 0 work parked**, not abandoned: S0-04 (Google baseline), S0-11, S0-12, S0-16, S0-17. | The setup consumed more time than the work it was gating. Everything not needing a key is done. Two external unblocks are needed, neither fixable from this repo: `ANTHROPIC_API_KEY` as an environment variable, and Places API (New) enabled on Google project `74590284143`. Resume with `python3 stage0/src/engine/preflight.py`. *(An earlier version of this entry blamed session timing for the 401s; that reason was wrong — see the two entries below.)* |
| 2026-09-20 | Outreach copy is **derived, not generated**, and refuses by default | An outreach line is the only text in the product a user pastes into an email to a real business, so a plausible sentence with no evidence behind it is the most expensive thing here to get wrong. `src/lib/outreach.ts` writes nothing for an unread site, an unreadable one, a business with no matched criterion, or a gap with no catalogued consequence, and every clause it does write is listed with the evidence it rests on. A model, when one runs, should rewrite these sentences rather than add claims. |
| 2026-09-20 | ICP discovery **built without S1-22**, on a typed offer instead of a fetched site | Reading the seller's own site needs a model key that is still blocked, but it is only the input step. Splitting the flow at that seam shipped S1-23 – S1-26 now and leaves S1-22 a drop-in upgrade. A named-offer chip list is an optimisation over free-text matching, not a precondition — the same two-layer rule `engine/check_plan.py` follows. |
| 2026-09-20 | Unprovable ICP criteria are **listed and refused**, not hidden | Three of the seven catalogued signals cannot be settled today (contact form, mobile-ready, stale site). Dropping them silently would make the flow look better and deliver ICPs the engine cannot serve; showing them with what it would take makes the gap a roadmap instead of a surprise. `docs/icp-discovery.md` rule 1. |
| 2026-09-20 | `public/data/index.json` now carries each market's criteria and tallies | The ICP flow shows live counts for several candidate ICPs at once. Reading them from the market files would cost four megabytes to display three numbers, in the one place the product promises the count is free. ~1 KB per market in the index instead. |
| 2026-09-20 | The confirm step **blocks** on a contradiction or a declined term, rather than warning | The product document says "flags the conflict"; a flag next to a live count still invites the user to run a search whose answer is the empty intersection by definition. Blocking costs one click (each chip has a drop button) and removes a result that would look like a data gap. |
| 2026-09-20 | Two plural bugs in the signal catalogue, **found by rendering the page, not by the tests** | `\breview\b` can never match "reviews" and `\bchristian\b` can never match "christians" — so a criterion silently vanished and a *sensitive-attribute refusal silently failed to fire*. The unit tests passed throughout: they used the singular. Every `inCriterion`, `PEOPLE` and `SENSITIVE` pattern now spells its plurals, and the tests use the plural forms a user would type. A refusal that quietly does not fire is worse than no refusal. |
| 2026-09-20 | Query parsing is **deterministic today and stays useful when a model lands** | S0-12 will read the query properly. Until then the parser recognises what it has a rule for and reports `unrecognised` instead of guessing. Worth keeping either way: the confirm step is the contract the user agrees to, so two identical searches must not produce two different wordings of it. |
| 2026-09-20 | The crawler's user agent pointed at a **domain that does not exist**, for the whole of Stage 0 | `smallfish.example/bot` was a placeholder nobody noticed while 720 real sites were crawled. S0-26 measured that honest identification costs one readable site in 78 and kept the principle on that basis; a URL a site owner cannot open pays that price and buys nothing back. The page is now at `/bot` on the deployed site, and `test_crawler_identity.py` fails the build if the two drift apart. The contact address was the remaining half of the same problem and was closed the same day with a real inbox; both are now asserted against placeholder domains, because a removal route that bounces is worse than not offering one. |
| 2026-09-20 | S0-10's number, finally recorded: **56.0–57.4% settled without a model where a detector exists; 25.0% overall** | The task's definition of done was always a number, and the detector had been shipped and used for days without it. The overall figure is the honest one to plan cost against: four of seven benchmark criteria have no detector, so most criteria still need a model. |
| 2026-09-20 | Found by recording that number: **`vet-columbus/independent` can never be settled** — couldn't-tell for all 117 attempted | An *absence* criterion with no detector does not report `needs_model`; the absence rule answers couldn't-tell instead. So it looks like a hard market rather than a missing detector, and nothing flags it. The first version of the measurement had the same blind spot and reported a meaningless 0.0–57.4% range. Uncoverable absence criteria are now called out by name. |
| 2026-09-21 | **Gate item 1 restated from "Google's count" to "overlap with Google's places"** | Measured: Places Text Search (New) hard-caps at 60 results — three pages of 20 — against Overture's 3,009 for the same metro. No call yields a count, so the gate as written was never measurable. The restatement is also the better question: a count ratio can read 100% while the two sets overlap by half. |
| 2026-09-21 | **Gate item 1 FAILS for HVAC and passes for veterinary; med spa and dental are undecided** | 240 cells across four metros, 884 on-niche Google places. Veterinary 73.1–86.0% clears 70% even on the strict reading. **HVAC is 31.1–47.8% and fails even when every ambiguous pair is counted as a hit** — Overture is missing more than half of Tampa's HVAC contractors, which fits: service-area businesses with no walk-in premises are exactly what a places dataset under-records. Med spa (45.4–79.3%) and dental (63.8–94.3%) straddle the threshold. |
| 2026-09-21 | Coverage is reported as a **band, not a number**, and the band is wide | 28.5% of Google places sit at an address where Overture has *a* business under a name string matching cannot reconcile. Some are the same practice — "Dr. Anthony R. Valenzuela, DMD" vs "Tony Valenzuela D.M.D.", 13 m apart, scores 0.10 on token overlap. Some are different dentists sharing a medical building — "Dr. Oksana Stoj, DMD" and "Dr. Shannon Coen", 6 m apart. Picking either interpretation would have produced a confident number in whichever direction was preferred. Settling it needs a model reading both names, which is S0-12. |
| 2026-09-21 | A first coverage run read **0%** and was an artifact, caught before it was believed | Google relaxes a text query when a sparse cell has nothing better: "med spa" in a Grand Prairie cell returned Solis Mammography, Regal Nails and Vachale Beauty Concepts. Scoring Overture against those measures coverage of businesses that are not in the niche. Results are now filtered on the returned `primaryType`. Filtering on the *returned* type rather than passing `includedType` is also measured: `general_contractor` comes back as a primaryType but is rejected as an includedType, as are `medical_spa` and `hvac_contractor`. |
| 2026-09-21 | Our Overture extract's **category filter is not the limiter** | Suspected, then checked against an unfiltered 199,013-row pull of the same Phoenix bbox: only 2.5% of unmatched Google places were businesses Overture holds under a category `benchmarks.json` does not list (`health_and_medical`, mostly). Worth fixing, but it does not explain the gap. |
| 2026-09-21 | **Gap-fill is cheap; the cold read is what threatens the unit economics** | Gate item 1's escape clause priced from measured inputs. Buying a business from Google costs **$0.0079** — coverage failing at 31% adds only $0.015/match in the worst niche. The bill is read cost ÷ match rate: at the planned $0.010 cold read, every market is over the $0.04 budget ($0.040–0.067); at the $0.002 warm read every market is inside it ($0.015–0.029). Break-even cold read in the worst market is **$0.0043/business**, less than half the planning estimate. |
| 2026-09-21 | **"Narrow the beachhead" rejected as the response to the HVAC coverage failure** | Dropping HVAC would have removed the cheapest-to-fix problem and left the expensive one untouched: HVAC's discovery gap costs $0.015/match to buy, while its read cost is the *best* of the three priced markets because its match rate is highest (37.2%). Coverage is not what decides this product; cost per match is. |
| 2026-09-21 | Stage 0's decisive number is now **gate item 4, not gate item 1** | Coverage is answered and survivable. Precision and cost are not answered at all, and the cost model above is dominated by a figure nobody has metered. S0-15 metering a real run is now the highest-value remaining task, ahead of more coverage work. |
| 2026-09-21 | **Cost per business measured at $0.0011–0.0020, five times below the planning estimate** | S0-08/11/12/15/17 built and run over 120 real businesses on Haiku 4.5. The $0.010 estimate was the single input the whole unit-economics question turned on, and it was ~5x high. Cost per match on dental, at whole-business granularity, is **$0.033 against the $0.04 budget**. |
| 2026-09-21 | **The gap-fill verdict reverses: every market is inside budget on the first pass** | `gapfill_cost.py` run against the estimate reported every market OVER budget and called the escape clause failed. Re-run against the measured read: med spa $0.029, HVAC $0.019, dental $0.012 — all inside $0.04, cold, gap-fill included. The earlier verdict is retracted. It was labelled as resting on an unmetered figure at the time, which is why it was worth metering rather than acting on. |
| 2026-09-21 | Detection settles more in a live run than the tally-based estimate suggested | Observed: 20 of 60 dental criteria settled by the detector with no model call, 12 of 60 on med spa. Combined with the absence rule short-circuit, only 16 of 60 dental businesses needed a model call at all. This is why the per-business cost came in low — the cheap layer is doing more work than S0-10's static tally showed. |
| 2026-09-21 | **Couldn't-tell on readable sites is 38.9%, worse than the 19–25% the probe estimated** | The probe-based figure counted a site as judgeable if it was readable; the live run asks whether the *criterion* was settled, which is a harder test. The ≤25% target is not met on dental. This is a genuine regression against a number recorded as passing, and it is now the open quality question alongside precision. |
| 2026-09-21 | Prompt caching contributes **nothing** at current prompt sizes | Measured `cache_read_input_tokens` at 0% of billed input across both runs. The shared system prompt is ~400 tokens, below Haiku 4.5's minimum cacheable prefix. Recorded rather than fixed: padding a prompt to reach a cache threshold would cost more than it saves at this volume. |
| 2026-09-21 | **S0-11 and S0-14 merged into S0-12** — one model call, not three passes | The plan sketched extract-a-profile, judge-the-profile, validate-the-proof as three stages. They are one call in `judge.py`: a second call per business doubles the dominant cost, and splitting extraction from judgment detaches the quote from the verdict that used it, which the proof validator then has to reattach. **The tradeoff is real and against us in one place:** a standalone reusable profile would make a *second* search against the same business nearly free, and this design forfeits that. Revisit if searches-per-business ever exceeds ~2. |
| 2026-09-21 | A test that hard-coded "S0-12 is not built" **failed on progress** | `test_preflight.py` froze the project state into an assertion and broke the moment `judge.py` was written. Rewritten to compare preflight's report against the filesystem. A test that breaks when work gets done is testing the calendar. |
