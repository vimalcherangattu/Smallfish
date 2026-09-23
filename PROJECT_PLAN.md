# Small Fish — Project Plan

The single source of truth for what is being built, in what order, and what must be true
before moving on. The founding documents are **live Claude Docs**, linked from
`CLAUDE.md` and read through the Claude Docs connector; the review that reshaped this plan
is `docs/critique.md`.

Strategy lives in those docs. Numbers and decisions live here. Where they disagree, this
plan wins and the Decision log records why.

**Last updated:** 2026-09-21 · **Stage:** 0 — Prove it (**model choice was the dominant lever: Haiku → Sonnet 5 took recall 6.7% → 33.3%**)

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
| 0 · Prove it | **In progress** | Coverage ≥ 70% and precision ≥ 90% on 3 niches | All 3 niches measured on one engine. **Gate item 4 is retired** — it compared a measured cost against a threshold derived from an unvalidated price. Replaced by band-specific cost per credit: dental $0.0294 (band 1), med spa $0.0687 (band 2), HVAC $0.0596 (band 3), **all inside every plan's margin**. Cost per business read is flat at $0.0168 ± 0.0002 |
| 1 · Launch | Not started | 50 paying users; live precision ≥ 90% | — |
| 2 · Grow | Not started | 300 paying; churn ≤ 6%; **cost per credit ≤ $0.07 in every band** | — |
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
| **Criteria settled with no model call** (the cost lever, S0-10) | measure | **35 of 100 dental criteria**, live. 56.0–57.4% where a detector exists (2026-09-20) still stands | 2026-09-21 |
| — across every criterion, detector or not | — | **25.0%** (285 of 1,138) | 2026-09-20 |
| — benchmark criteria with no detector at all | — | **4 of 7**, settling nothing | 2026-09-20 |
| — **model calls per 100 dental businesses** | — | **46** (461 per 1,000), up from 23. The cost of escalating generic detector hits, and it buys 25 points of recall | 2026-09-22 |
| Match precision, blended | ≥ 90% | **100.0%** ✓ **PASSES** — **41** positive calls, **0 false positives**, CI **91.4**–100%. 72 enriched hand labels. Dental only; the gate wants three niches | 2026-09-22 |
| — **measurement noise floor**, identical code and frozen corpus | — | precision read **71.4% then 83.3%** on two runs that differed in nothing. Below the Haiku→Sonnet gap, no engine change is distinguishable from this | 2026-09-21 |
| Match precision, absence criteria only | ≥ 90% | **100.0%** ✓ (lower bound **91.4%**, 41 calls) — the gate reads this separately and it passes too | 2026-09-22 |
| **Known-match recall (delivered)** | ≥ 60% | **55.0%** (11 of 20), CI 34.2–74.2% — **UNDECIDED**, no longer failing. Was 30.0% before generic detector hits were escalated to the model | 2026-09-22 |
| — abstained on a true match | — | **8 of 20**, of which **5 are unreadable sites** — 3 abstentions left to win | 2026-09-22 |
| — wrongly rejected a true match | — | **1 of 20** (was 7 when the detector settled generic hits) | 2026-09-22 |
| **Recall ceiling with the current crawl** | — | **75%** (15 of 20 true matches readable). At 55.0% delivered, **3 abstentions separate the engine from the 60% target** | 2026-09-22 |
| Source data has the wrong website | — | **5 of 70 (7%)** — caps achievable precision | 2026-09-21 |
| Human could not establish truth | — | 17 of 70 (24%) | 2026-09-21 |
| Cold cost per business | ≤ $0.010 | **$0.0032 Sonnet 5** ✓ over 1,000, 696 cold-fetched (Haiku $0.0011, Opus $0.0074) | 2026-09-21 |
| Warm cost per business | ≤ $0.002 | — | — |
| **Cost per credit, by band** | ≤ $0.07 | **band 1 $0.0294 · band 2 $0.0687 · band 3 $0.0596** ✓ — replaces "blended cost per match ≤ $0.04", which priced against a threshold no buyer had validated | 2026-09-23 |
| — the same figure unbanded, for reference | — | $0.0294 / $0.1374 / $0.1787 — a 6.1× spread, which is what the bands exist to collapse (to 2.34×) | 2026-09-23 |
| **Worst-case loss on one scan** | bounded | **$3.36**, any plan, any criterion — 200 reads before the first solvency check | 2026-09-23 |
| **Worst-case period loss, nothing matching** | ≥ $0 on every paid plan | Starter +$6.82 · Growth +$5.08 · Agency +$14.20 · Watch +$11.61 · **Pack +$0.52** | 2026-09-23 |
| — Google gap-fill discovery, measured | — | **$0.0079 per business discovered** | 2026-09-21 |
| — break-even cold read cost, worst market | — | $0.0043/business — **measured read is $0.0020, inside it** | 2026-09-21 |
| Proof validity (quote found verbatim in fetched text) | high | **100%** (11 of 11 model verdicts) | 2026-09-21 |
| Couldn't-tell on **readable** sites | ≤ 25% | **24.5%** ✓ over 1,000 businesses — *thin margin*, 11.8% if generic hits settle | 2026-09-22 |
| — of which: one-page reads | — | 9 of 21 remaining couldn't-tells; one-page reads are ~100% couldn't-tell | 2026-09-21 |
| — mean pages read per readable site | — | **3.30** (was 3.27 before the link fix) | 2026-09-21 |
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
   that keeps cost per credit inside the band budget). *Restated from "count" — Google's
   API caps at 60 results and cannot yield a count; see the Decision log, 2026-09-21.*
   **Measured: fails for HVAC on every reading, passes for veterinary, undecided for
   med spa and dental.**
2. Blended match precision ≥ 90% **and** absence-criterion precision ≥ 90%.
3. Known-match recall ≥ 60%.
4. **Cost per credit ≤ $0.07 in every band.** *Restated from "blended cost per match
   ≤ $0.04" for the same reason item 1 was restated: the threshold's numerator — what a
   buyer pays per matched lead — was an assumption, not a measurement, and the aggregate
   it was applied to made a one-criterion market look solvent and a two-criterion market
   look broken when the only difference was arithmetic. See the Decision log,
   2026-09-22 and 2026-09-23.* **Measured: passes in all three bands.**

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
- [x] **S0-08 · Polite fetcher.** `engine/fetcher.py`, used by every benchmark run. robots.txt honoured, identified user agent, per-domain
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
- [x] **S0-11 · Fact profile extraction.** One model pass per business → services,
  specialties, booking method, contact routes, staff count, locations, languages, ownership
  hints, and quotes with source URLs. Store the profile, never full page copies.
- [x] **S0-12 · Criteria judge.** `engine/judge.py`, run over 2,464 in-niche businesses. Cheap signals first, then a small model, with a stronger
  model on borderline cases and a random audit sample. Returns verdict, proof quote,
  confidence word.
- [x] **S0-13 · Absence-proof rule.** `engine/absence.py`. A "no X" verdict requires the
  X-relevant pages to have been read, something competent to have looked, and nothing to
  have been found. Defaults to couldn't tell on every other path. 15 tests in
  `stage0/tests/test_absence.py`, including an exhaustive sweep of the decision space
  asserting no input reaches MATCH without relevant pages read — a bug here produces a
  confident false match, which is the one failure that destroys trust *and* gets billed.
- [x] **S0-14 · Proof validator.** Proof validity 100% on all three measured markets. Every quote is verified verbatim on its linked page
  before display; failures become couldn't tell. *Done when:* proof validity is 100% on the
  benchmark set.
- [x] **S0-15 · Cost meter.** Per-business cost logs for every run in `stage0/data/`. Per-business tokens, model, pages fetched, rendering used,
  cold or warm — logged for every run. *Done when:* a run prints real cost per business and
  per match.

### S0.C — Benchmark

- [ ] **S0-16 · Hand-label the benchmark set.** **Done for dental only (72 labels); med spa and HVAC not collected**, which is what leaves gate item 2 unproven outside one niche.
  `benchmark/labelling_set.py` generates a self-contained HTML tool — no server, no
  install, saves to localStorage, exports JSON — that can be sent to a labeller who has
  never seen this repo. Three methodological choices are enforced in it: labelling is
  **blind** to the engine's verdict (seeing it anchors the labeller and inflates
  precision by the amount being measured); the slice is **complete**, not a sample of
  the engine's output (recall's misses are by definition not in that output); and
  unreadable sites are labelled too, which separates "wrong" from "couldn't see".
  *Blocked on:* a human. 100 businesses × 1 criterion for dental is ready to label.
- [x] **S0-17 · Benchmark harness.** `benchmark/run.py` + `score.py`; three markets measured. Runs the engine over the labelled set and reports
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
  **Tool built and baseline taken (2026-09-23), 60 dental sites.** The seven-day
  figure needs seven days and nothing can shorten that; the box stays unticked
  until it exists. What *is* measured is the **noise floor**, which had to come
  first: re-read minutes apart with nothing changed, **raw HTML reads as 31.7%
  changed, visible text 6.7%, normalised text 5.0%, detected signals 0.0%**.
  Run on 2026-09-30:
  `python3 stage0/src/engine/change_rate.py --market dental-phoenix --compare --sample 60`
- [ ] **S0-21 · Publish the benchmark page.** Precision and couldn't-tell per niche, method
  shown. This is the launch story.

### S0.D — Economics

- [x] **S0-22 · Rebuild the unit-economics model from measured inputs**, with margin stated
  *without* breakage. *Done when:* the model consumes S0-15 output and prints margin per
  plan at measured match rates.
- [ ] **S0-23 · Model the alert engine cost** from S0-20 and set per-plan saved-search
  candidate budgets. **Model the gated cycle, not the naive one:** a week costs one
  crawl per watched business (no model call) plus a re-judge only on those whose
  **signals hash** moved. The same-day noise floor already says the gate is worth having
  — raw HTML 31.7% vs judged signals 0.0% — so a model built on raw-byte change would
  overstate the bill by roughly the ratio between those two. What is still missing is
  the numerator: the seven-day signals-change rate, due 2026-09-30. *Blocked on S0-20.*
- [ ] **S0-24 · Re-budget GTM model spend** at the real page target (Change 8).
- [x] **S0-25 · Decide pricing** against measured costs. **Decided 2026-09-23** (`docs/PRICING.md`, with amendments of the same date recorded in its §4):
  bill per matched business, **banded 1× / 2× / 3× by sample match rate**, band shown on the
  confirm screen before anything is spent. Non-matches and couldn't-tell stay free, as counts
  and reasons only. Plans $0 / $29 / $79 / $199 plus Watch $19 and a $19 pack. The 2× rare-search
  rule is superseded by measured thresholds. **My per-business-read recommendation was rejected**
  on positioning grounds — it hands the customer the "you pay for junk" complaint the product
  positioned against, and loses to Exa on the comparison buyers actually run.
- [x] **S0-30 · Close every loss-making path in the decided pricing.** Encoded in
  `src/lib/pricing.ts`, checked by `stage0/tests/test_pricing.mjs` (52 assertions).
  Three paths were open after the decision, and the guardrail named in it was not one of
  the things that closed them — see the four 2026-09-23 entries in the Decision log.
  What holds now: **a single scan can lose at most $3.36**, on any plan, with any criterion;
  every paid plan is solvent in a period where **nothing matches at all**; and the band a
  customer is shown can only be billed downward. The free tier costs **$3.70 per user per
  period**, bounded. Pack's $0.52 worst-case margin is the tightest number in the pricing.

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
- [x] **S1-02 · Free match count** from a sample, with three proven samples shown free.
  `src/lib/count.ts` + `src/components/FreeCount.tsx`, 16 tests. **It reports a range,
  which is a departure from the founding document's single "about 140 matches"** — a
  25-business sample cannot carry a point estimate, and inventing three significant
  figures out of four observations is the exact thing this product claims not to do.
  The sample is shown beside the range (read / matched / could-not-be-settled), and
  the band is quoted from the cautious end of it rather than its midpoint. *Streaming
  and tightening is still to do, with S1-03.* Anonymous limits set from the S0 cost
  model, not from the
  founding document's 5/day (Critique 5). **Sample 25, cached by query for 7 days,
  2/day anonymous per device+IP then email signup, 20/day logged in** — measured at
  $0.42 per anonymous count, against $1.01 at the 60 the founding document assumed.
  The sample also **quotes the band** shown on the confirm screen. It cannot do more
  than that: one match in 25 has a 95% interval of [0.7%, 19.5%], so the count is a
  quote and a band, never a solvency judgement — that belongs to S1-04's live abort.
  Programmatic pages serve a **stored** count and never scan per visitor (→ S1-14).
- [ ] **S1-03 · Cold-market UX** (Change 11): streamed partial counts, a fast path to the
  first three matches, and an honest "reading this market, we'll email you" state.
- [x] **S1-04 · Results table with proof**, three statuses, side panel per criterion, and
  one-click wrong-result reporting with automatic refund — refunded rows leave the
  headline count and the export, with an undo. `src/components/Results.tsx`,
  `src/lib/billing.ts`, 22 tests across `test_results_privacy.mjs` and
  `test_billing.mjs`. Carries the two guardrails
  from `src/lib/pricing.ts`, both already coded and tested:
  - **Non-match privacy.** Non-matches and couldn't-tell surface as **counts and reasons
    only** — no names, no domains, no export, nothing that reconstitutes the candidate
    list. This is not a UI preference: charging only for matches means an impossible
    criterion would otherwise hand over a whole market for free. No-website businesses
    are a **paid unlock at 0.25 credits**, sold rather than leaked.
  - **Scan budget and live abort.** 11 reads per remaining credit, and `checkRunHealth`
    stops a run at 200 / 400 / 800 / 1,600 reads when its live match rate can no longer
    pay for its own reading. When it stops, the table says how many were read, how many
    matched and what to change — the refusal is the product surface, so it has to be
    legible to someone who is paying.
- [x] **S1-05 · Published contacts** — website, phone, public email and contact form, each
  with the page it was read from and how it was confirmed. `stage0/src/coverage/
  extract_contacts.py` + `PublishedContacts` in `Results.tsx`, 25 tests. Built from the
  existing fetch cache, so it cost nothing and touched no site again. **Socials are
  refused, not delivered**: they are icon anchors living in `href` attributes, and the
  probe stores visible text only, so they are 0.5% recoverable — the honest fix is a
  fetcher that keeps link targets (below), not a guessed `facebook.com/<name>`.
  Measured: of 1,654 readable sites, 39% publish an email, 88% show a phone, 37% have a
  contact page. Of the businesses with a cached read, **576 across three markets are
  withheld entirely** because the site is a chain or platform page or never names them,
  and 55 more ship with a caveat.
- [x] **S1-05b · Keep link targets in the fetcher**, so socials and mailto-only addresses
  become extractable. `Page.links` in `engine/fetcher.py` keeps `mailto:`, `tel:` and the
  recognised social hosts and **nothing else** — a business's whole link graph is not a
  fact about the business, and storing it would be storing a page copy by instalments.
  `CACHE_VERSION` is deliberately **not** bumped: a bump means "this shape is wrong,
  re-fetch it", and 1,654 cached entries are not wrong, merely older than one field.
  Re-crawling them all to collect an attribute is the same impoliteness this repo
  already refuses for a detector retune. So a site read before the change reports
  `linksKept: false`, and the screen says "we did not look" rather than "it has none".
  Measured on a fresh sample by `coverage/validate_links.py`.
- [x] **S1-06 · Export to CSV with proof columns.** Every row carries, per criterion, the
  verdict, the evidence and the one-line "how this is checked", plus a `why_it_matched`
  sentence usable in a cold email as written, and a `billable` column so the pricing
  promise is visible in the file itself. 14 tests cover the quoting, because a CSV bug
  does not raise, it silently shifts every column of someone's spreadsheet.
  **Amended 2026-09-23: the file now carries matched rows only.** It used to export
  non-matches as full rows — name, phone and website included — on the reasoning that
  "this site blocks automated reading" is worth more to the user than a silently dropped
  row. That reasoning survives, in `nonMatchSummary`, which gives the counts and reasons
  without the identities. What was wrong was the identity travelling with them: billing
  only for matches means a criterion nothing satisfies would have handed over an entire
  market's contact list for free, and that is the one attack the pricing has no other
  answer to. The export button now states how many rows the file will carry, because a
  button that exports fewer rows than the table shows, without saying so, is how people
  stop trusting a file they are about to send to a client.
- [ ] **S1-06b · Google Sheets export and duplicate protection.** Needs accounts, so it
  follows S1-08.
- [ ] **S1-07 · Saved searches and alerts**, with the candidate-volume budget from S0-23
  enforced. **Alerts gate on the signals hash**, not on raw HTML or visible text.
  Measured on 60 dental sites re-read the same day, where nothing real had changed:
  raw HTML **31.7%** "changed", visible text 6.7%, normalised text 5.0%, judged signals
  **0.0%**. Raw-byte alerting would re-judge a third of the book every week to discover
  nothing moved — the cost scales with retention, so it compounds in the direction
  nobody notices until the bill arrives. Re-crawl, compare the signals hash, and pay for
  a re-judge only where something the rubric could care about moved (`change_rate.py`).
  Also carries the **subscription-supply** surfaces the pricing decision requires: a
  monthly digest per saved search split into new / changed / newly-unblocked (counts
  free, names on unlock), a market-depletion meter ("310 of ~400 unlocked here"),
  expansion suggestions with estimated counts, and pause-instead-of-cancel.
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
| **Markets per user per quarter** — share of paying users running a **second** market | — | **≥ 60%** | ≥ 60% |

**Why markets-per-user is now a headline metric.** It is the earliest honest signal of
whether a subscription is the right shape at all. A metro niche holds roughly 300–500
matches and Starter's allowance is 120, so the first market is three to four months of
supply — after that, renewal depends on the customer having somewhere else to look.
The subscription's real supply is drip + newly-unblocked + **expansion**, and expansion
is the only unbounded one. If this metric sits at 1, **packs are the honest product and
the subscription is not**, which is a pricing-model change rather than a growth problem.
Tracked from day 60 because that is when the first cohort's first market runs dry.

---

## Stage 2 — Grow

**Gate to Stage 3.** 300 paying users; churn ≤ 6%; cost per credit ≤ $0.07 in every band;
**≥ 60% of paying users running a second market by day 60** (see Metrics).

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
| Cost per credit above $0.07 in any band | Monthly cost report | Raise prices or trim allowances before scaling acquisition |
| **Markets per user stays at 1** (new) | Second-market rate at day 60 | Packs become the headline product and the subscription is repriced — this is the falsifier for the whole subscription shape, not a growth problem |
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
| 2026-09-21 | **Overture's `website` field is sometimes another company's site**, and the labelling tool now has an answer for it | Found by looking at the first business in the first generated labelling set: Overture lists "AAA Accurate Dental Care" against `advancedsmilescenter.com`. Every verdict about that row is about a different business. Without a distinct label the labeller would be forced into match / no-match / can't-tell, and a data-source defect would be scored as an engine defect. `score.py` excludes these and warns when they exceed 5% of a slice — they cap the precision this product can reach, because each one is a row a user receives about the wrong company. Rate unknown until labelling runs. |
| 2026-09-21 | Labelling is **blind to the engine's verdict**, by construction | The verdict is not in the task JSON, not in the HTML, and not recoverable from either; `score.py` joins it on afterwards. A labeller who can see "the engine said match" agrees with it more often, which inflates precision by exactly the quantity the gate is trying to measure. |
| 2026-09-21 | **Retraction: gate item 4 is NOT answered.** The "$0.033 per match ✓" recorded earlier today was one sample presented as settled | Cost per match = cost per business ÷ match rate. Cost per business is stable and measured ($0.0009–0.0020 over 160 businesses). The match rate is not: dental returned 4 matches of 60 on one run and 1 of 54 on the next. Wilson intervals on those rates (2.6–15.9% and 0.3–9.8%) put cost per match anywhere between **$0.007 and $0.284**. The budget is $0.04, so the interval straddles it and the gate cannot be called either way. Settling it needs enough matches for a tight rate — roughly 30+, which means a slice of several hundred businesses, not 100. |
| 2026-09-21 | **Two bugs behind the failing couldn't-tell rate, found by diagnosing rather than assuming** | The rate is a page-count problem, not a judgment problem: one-page reads were 91% couldn't-tell, four-page reads 12%. Cause one — a site with no other internal pages was being told "you did not read the criterion-relevant pages" when the homepage *is* every page; the absence rule now accepts a whole-site read. Cause two — sub-page fetch failures were dropped silently, so "we tried /request-appointment and it failed" was indistinguishable from "there was nothing to read". Now recorded and reported (5 in the latest run). Result: 38.9% → **31.5%**, still above the ≤25% target. |
| 2026-09-21 | The fetch cache is **versioned**, after nearly shipping a cache-shaped bug | Adding `internal_links` to a cached read meant every pre-existing one-page entry would deserialise with `internal_links = 0` and claim to be a complete single-page site, letting the absence rule settle criteria nobody had checked the links for. Entries whose version does not match are now treated as misses. Re-fetching costs a request; reading a stale shape with defaults costs a wrong verdict. |
| 2026-09-21 | Remaining couldn't-tell cause, **not yet fixed**: 6 of 10 one-page reads have internal pages we never fetched | Either `select_links` scored none of them (its pattern rejects any href containing `#` and requires a closing `</a>`) or the fetch failed. Worth fixing before the next cost run, since cost per match depends on the match rate and every unsettled criterion suppresses it. |
| 2026-09-21 | **The link-selection fix was a real bug fix with a negligible effect. No win claimed.** | Two defects were confirmed by test — an href containing `#` was rejected outright, and a closing `</a>` was mandatory so unclosed tags hid every link after them. Both are genuinely wrong and now have 15 regression tests. But the measured effect on this corpus was mean pages per readable site 3.27 → **3.30**, and one fewer one-page site out of ten. The hypothesis that these bugs caused the one-page reads was wrong. |
| 2026-09-21 | **Run-to-run variance swamps the effects being chased, so engine changes cannot be evaluated on a live re-crawl** | Three consecutive dental runs put couldn't-tell at 38.9%, 31.5% and 36.8%. The code changed each time *and* all 100 sites were re-crawled each time, so nothing can be attributed. `run.py --frozen` now reuses cached pages whatever their version, making a judge-only A/B possible against a fixed corpus. Any future claim that a change improved a rate must come from a frozen-corpus comparison, not from consecutive live runs. |
| 2026-09-21 | Remaining one-page causes, now measured rather than guessed | Of the ~9 one-page readable sites: 4 genuinely have no other internal pages, 5 had sub-page fetches that failed, and the rest link only to pages no check-plan keyword matches. The first group is handled; the second is our own failure and is now recorded per read; the third is a check-plan coverage question, not a crawler bug. |
| 2026-09-21 | **First hand-labelled result: recall is 6.7% and gate item 3 fails outright** | 70 blind labels on dental-phoenix. Of 15 businesses that truly have no online booking, the user receives **1**. The engine abstained on 12 and wrongly rejected 2. Precision reads 100% only because it made a single positive call (CI 20.7–100%, undecided). This is the abstention failure the scorer was built to expose: the engine avoids being wrong by refusing to answer. It also explains the unstable cost-per-match — with one match per hundred businesses, that denominator was never going to hold still. |
| 2026-09-21 | **The scorer's own recall definition was wrong and flattered the engine** | It excluded abstentions from the recall denominator, reporting 1-of-15 as "33%". Gate item 3 asks how many true matches the engine *found*, and a business it abstained on is one the user never receives — "not sure" and "no" are indistinguishable from where they sit. Delivered recall is now the headline; the decided-only figure is kept as a diagnostic and labelled as one. Abstention stays excluded from *precision*, which is correct: we told the user nothing false. |
| 2026-09-21 | Two ceilings on precision that are not the engine's to fix | **7% of the slice (5 of 70) had the wrong website in Overture** — every verdict on those is about a different company, and no engine work recovers it. **24% (17 of 70) the human could not establish either**, which says the criterion is often not decidable from a public site at all. Together, a quarter of a typical slice has no reachable ground truth. |
| 2026-09-21 | Diagnosis for the recall failure: the bottleneck is **satisfying the absence rule, not judging** | The engine says `no_match` readily — the detector settles that from one page, cheaply and confidently. Saying `match` requires the absence rule, which requires criterion-relevant pages to have been read, which the crawl often fails to do. Result: it is 19-for-19 willing to reject and almost never willing to confirm. Fixing recall means getting the right pages read, not changing the prompt. |
| 2026-09-21 | **Model choice was the dominant lever, and the product document's "Haiku 4.5 class" is refuted by measurement** | Frozen corpus, identical prompt, identical 70 labels — only the model changed. Haiku 4.5: 6.7% recall, 50% precision, $0.037/match. **Sonnet 5: 33.3% recall, 83.3% precision, $0.032/match.** Opus 5: 40.0% recall but precision *fell* to 75.0% and cost/match blew the budget at $0.062. Default worker model changed to Sonnet 5 in `engine/llm.py`. |
| 2026-09-21 | **The stronger model is CHEAPER per match, which inverts the intuition the cost model was built on** | Cost per match is cost per business ÷ match rate. Sonnet costs 2.6× Haiku per business and finds 5× as many matches, so the bill per billable row falls. Every earlier cost argument assumed the cheap model was the cheap option; on the measured numbers it is the expensive one. Opus breaks the pattern — its recall gain does not pay for its price. |
| 2026-09-21 | **Three targeted fixes failed before the right lever was found. Recording the failures, not just the win.** | (1) Two real link-selection bugs — negligible effect. (2) "The absence rule is too strict" — measured zero cases where it overrode a model match. (3) "The prompt makes absence matches unreachable" — well-evidenced, correctly fixed, and delivered recall did not move at all; it converted abstentions into rejections instead. Only the fourth hypothesis paid. The lesson is the frozen-corpus A/B, without which none of these would have been distinguishable from noise. |
| 2026-09-21 | **Recall's ceiling with the current crawl is 67%, which clears the 60% target** | Of the 7 true matches Sonnet still abstains on, 5 are sites that cannot be read at all (blocked, robots-blocked, or too thin). Those can never be confirmed, so 10 of 15 is the practical maximum. The target sits below the ceiling, which means the remaining 33.3% → 60% gap is closable rather than structural — unlike coverage, where HVAC failed against a hard limit. |
| 2026-09-21 | **The detector was conflating "this business buys software from X" with "a customer can book"** | Found by reading the 3 false negatives, not by a test. Two were rejected by the *detector*, before any model saw them: Palm Valley Pediatric Dentistry because `dentrix.com` appeared in a footer — Dentrix is practice-management software, the back office — and Wright Orthodontics on a generic booking word with no vendor. The category error ran through the whole niche catalogue: `dental_intelligence` is analytics, `solutionreach`/`lighthouse360`/`revenuewell`/`modento` are patient messaging, `covetrus` is distribution. A comment in the file already said exactly this about Weave and the lesson had not been generalised. PMS/EHR vendors are now scoped to a booking-ish path; 7 pure comms/analytics vendors are dropped. `test_booking_evidence.py` pins both directions. |
| 2026-09-21 | **That retune produced no measurable effect, and the apparent regression it seemed to cause was noise** | Frozen-corpus A/B: `settled by detector` unchanged at 35 (the *generic* patterns still fire on the same sites), recall unchanged at 33.3%, precision apparently 83.3% → 71.4%. An identical re-run — same code, same corpus, same labels — then read 83.3% again. So the model is non-deterministic at a swing as large as the change being measured. The retune is kept because it is right on the merits, not because it measured better; the "regression" is retracted. |
| 2026-09-21 | **The 70-label sample is now the binding constraint on engine work, not the engine** | Precision rests on 6–7 positive calls, so its Wilson interval is 43.6–97.0% and nothing smaller than the Haiku→Sonnet gap is distinguishable from run-to-run variance. Three runs and ~$0.30 went into chasing a metric that could not be measured. Further tuning is suspended until the labelled set is larger; the frozen-corpus A/B is necessary but not sufficient — it controls the corpus, not the sampling error. |
| 2026-09-21 | **RETRACTION of the retraction: the detector retune was never exercised, so "it changed nothing" measured nothing** | Detection runs at fetch time and its output is stored in the fetch cache, so `--frozen` replays the catalogue that was live on the crawl date. The dentrix scoping was A/B'd against cached verdicts it had never produced; Palm Valley was still being rejected on a `dentrix` hit the live catalogue no longer emits. Once the corpus was re-crawled, detector settles on dental fell **35 → 7** — an enormous effect reported the day before as none. `tech_signals.CATALOGUE_FINGERPRINT` hashes the patterns so a catalogue change is self-announcing, a live run treats stale detection as a cache miss, and `benchmark/run.py` **refuses** to report a frozen run over stale detection. Hashing beats a version number because the number nobody remembers to bump is the one that fails. |
| 2026-09-21 | **A generic affordance word no longer settles a criterion; only a named vendor does** | Wright Orthodontics was rejected for "has no online booking" on an `/appointments/` href and a "Schedule Now" button, with no model call. That page is a GoHighLevel lead form whose own text reads "complete the following form to request an appointment… availability will vary… your appointment will be confirmed by phone". An appointment-*request* form wears the same words as online booking and is the opposite answer. The hand label is right and the detector was wrong. Letting a word short-circuit the model is the cheap layer overriding the general one, which inverts `CLAUDE.md`'s "detection is a cheap optimisation over model judgment, never a precondition". A vendor embed is different: a Calendly widget *is* the booking. |
| 2026-09-21 | A cheaper strong/weak split was tested first and **does not separate the cases** | Before escalating every generic hit, the obvious cheaper fix — settle on "book online"/"online scheduling", escalate on a bare `/appointments/` — was measured on the labelled slice. Strong signals were right 6 of 7, weak 3 of 4: indistinguishable at n=12. "Request an appointment" language also appears on sites that *do* have booking (North Scottsdale, Gentle Dental Ahwatukee). No lexical rule separates a request form from a booking widget, which is the argument for handing the question to the model rather than a better regex. |
| 2026-09-21 | **Gate item 4 is re-opened and the cost lever is mostly gone — deliberately, and at a price not yet paid** | Model calls on dental rose **65 → 93 per 100 businesses**. S0-10's "56–57% settled with no model call" described a catalogue that no longer exists; the figure on dental is now 7%. The $0.032/match that passed gate item 4 was measured on the cheaper engine, so it no longer describes this one. The change is kept because the old behaviour is demonstrably wrong on read evidence, not because it measured better — it has not been measured at all. **Of the 12 escalated cases where truth is known, the detector had 10 right and 2 wrong**, so the model must reproduce 10 correct rejections or precision falls. That is the risk this change takes, stated in advance. |
| 2026-09-21 | The one-page absence fix was **dead code from the day it was written** | `judge.py` fudged `targeted_pages_read` to 1 when the homepage was the whole site, to satisfy the absence rule's "were the relevant pages reached" check. But a whole-site homepage has `pages_read == 1` by construction, and the rule's page-count check runs first and returns couldn't-tell before the fudge is ever read. The fix for one-page sites could not fire on a one-page site. `homepage_is_whole_site` is now a field on `AbsenceEvidence` and the exemption is applied where the decision is made, with the exhaustive sweep in `test_absence.py` extended to cover it. Measured yield is small — 4 whole-site reads in the slice, at most 1 recovered true match — and it is a correctness fix, not a recall win. |
| 2026-09-21 | **Precision and recall need different samples, and the difference is not size** | Precision's denominator is the engine's positive calls — ~9% of a random slice. 70 labels bought 6 positive calls and a 43.6–97.0% interval; deciding the 90% gate at a true 95% needs ~127 positive calls, which is **~2,200 randomly sampled businesses** and was never going to be labelled. Sampling on the engine's positives is unbiased for precision (that metric is already conditioned on the same event) and costs ~185 labels instead. Recall is the opposite: its denominator is every true match, and the ones the engine missed are absent from its output by construction, so recall needs a complete slice — **~150 labels** for a decidable interval at a true 80%. `labelling_set.py --enrich` builds the first, the default builds the second, and neither can measure the other. |
| 2026-09-21 | The sampling design **travels inside the labels file** and `score.py` refuses rather than warns | Recall computed from an enriched sample is not noisy, it is structurally wrong, and it reads HIGH — the direction that gets believed. Whoever runs the scorer months from now is not whoever chose the sampling, and a flag they forget produces a number nobody can tell is wrong by looking at it. So the design is recorded by the builder, exported with the labels, and the scorer reports "not computable from this sample" with the reason. Blindness survives enrichment only because of the filler: a labeller who knows every task is an engine match anchors on every task. |
| 2026-09-21 | Deciding a 90% gate near 90% is **inherently expensive**, which is a property of the gate | At a true precision of 100% the gate needs 35 positive calls; at 97%, 69; at 95%, 127; at 93%, **362**. If the engine is genuinely near the threshold, no affordable amount of labelling settles it. Worth knowing before committing to more labelling: the cheap outcome is an engine comfortably above 90%, and the expensive outcome is one that is merely close. |
| 2026-09-21 | **The generic-escalation change is REVERTED. It was principled, it was argued from read evidence, and measurement says it was wrong on every axis.** | Frozen corpus, same 70 labels, one line different. Escalating → settling: recall **26.7% → 40.0%**, precision **80.0% → 85.7%**, couldn't-tell on readable **29.3% ✗ → 10.3% ✓**, cost per match **$0.0705 ✗ → $0.0249 ✓**, model calls 51 → 23. Cost and couldn't-tell moved far outside the noise floor; recall and precision moved within it but in the same direction. Nothing about the argument for escalating was careless — it was just wrong, and only the A/B could say so. |
| 2026-09-21 | **The mechanism: the detector is a different sensor, not a cheap approximation of the model** | Checked after the result, because a win or loss with no mechanism is a coin flip. The generic patterns match **raw HTML** — hrefs, button markup, iframe sources — and the judge is handed `Page.text`, the *visible* text. **0 of 5 sites where the generic booking pattern fires are still matchable in the text the model sees.** Escalating did not promote the question to a better judge; it handed it to the only party that cannot see the evidence, and the model correctly abstained. That reframes `CLAUDE.md`'s two-layer rule rather than contradicting it: "a cheap optimisation over model judgment, never a precondition" governs anything the model could have decided for itself, and was never a licence to discard a channel the model is not shown. |
| 2026-09-21 | Wright Orthodontics stays wrongly rejected, and that is now **priced rather than overlooked** | One false rejection in this slice against 28 correct ones. Fixing it by blinding the detector costs 13 points of delivered recall and 2.8× the cost per match. The honest fix is to show the model the link structure so it judges on the same evidence — not to take evidence away from the engine to even the two up. Logged as the next engine experiment, not as a defect. |
| 2026-09-21 | **Recall is no longer a clear fail: 40.0%, CI 19.8–64.3%, UNDECIDED** | Best measured to date, on a corpus where detection actually ran. The 33.3% recorded yesterday was measured against stale cached detection. 6 of 15 true matches now reach the user; 5 of the 9 missed are sites that cannot be read at all, so the 67% ceiling still stands and the target sits below it. |
| 2026-09-21 | **2.1 MB of other people's website text had been committed to the repo** | The fetch cache stores the extracted text of each crawled site — ~10,000 characters per business across four pages — and 160 of those files were tracked. That is the thing `CLAUDE.md`'s "store extracted facts, not page copies" exists to prevent, sitting in a public repository. It is also pure derived state: `benchmark/run.py` rebuilds it by crawling. Now in `.gitignore` and untracked, along with `stage0/data/labelling/`. **Untracking does not purge history** — the content is still in earlier commits, and removing it needs a history rewrite, which is the repo owner's call, not something to do unannounced to a pushed branch. Found because a stop hook asked for untracked files to be committed; the right answer was the opposite of what was asked. |
| 2026-09-21 | **Cost per match measured at scale: $0.0309 over 1,000 businesses** ✓ | The first cost figure whose denominator holds still — 103 matches rather than 6. Inside the $0.04 budget, cold, with 696 of the 1,000 freshly crawled. Cost per business $0.0032, couldn't-tell on readable sites 8.0%, proof validity 78/78. Gate item 4 is answered again, on ten times the sample that answered it before. |
| 2026-09-21 | **Recall is not stable to one decimal, and the 40.0% reported an hour earlier is withdrawn as a point estimate** | The same code over a re-crawled corpus reads 33.3%; the frozen 100 read 40.0%. With 15 true matches in the labelled set, **one business is 6.7 points**. The A/B conclusion that produced 40.0% still stands — both arms shared one frozen corpus, and cost and couldn't-tell moved far outside noise — but the absolute figure is a range, 33–40%, and it still fails or straddles the 60% target. Recall is as unmeasurable as precision at this sample size, for the same reason and in the same way. |
| 2026-09-21 | The enriched and complete-slice label sets are **separate files**, because the default instruction would have destroyed the recall set | The generator's first version told the labeller to save the enriched export over `labels-<market>.json`, which is the complete slice. That slice is the only thing that can measure recall, is the more expensive of the two to rebuild, and its loss would not have surfaced as a wrong number anywhere — just a missing one. Separate filenames, separate localStorage keys, and a `--enriched` flag on the scorer. |
| 2026-09-22 | **A criterion phrase is not a definition, and the human and the model were each supplying their own** | "Has no online booking" was the benchmark's headline criterion for days before anyone asked what a *"fill out the short form and we'll contact you to confirm your appointment time"* form counts as. S&C Dental Scottsdale Ranch has a BOOK NOW button in its nav leading to exactly that. Both readings are defensible; what is not is the labeller and the judge each picking one privately, because then every disagreement scores as an engine error and no engine work can fix it. Every criterion now carries a **rubric** in `benchmarks.json`, rendered to the labeller and injected into the model's prompt from that one field. The booking rule: *can the customer walk away with a confirmed time without a human getting back to them?* Judge the destination, never the button. |
| 2026-09-22 | **The fetch cache was recording our failures as facts about businesses** | `timeout` and `probe_error` were written to disk like any other outcome, so one slow moment became a permanent couldn't-tell for that business and no later run would retry it. "Never blame the environment on the business" was already the rule for reported *rates*; the cache was breaking it for *verdicts*. Found the hard way: running two 1,000-site crawls concurrently took the timeout rate from **16 per 1,000 to 197 and 267**, and 18.6% of the entire cache turned out to be our failures recorded as theirs. Those entries are now never written and pre-existing ones are evicted on read. The distinction is whose fact it is — `dead`, `blocked`, `thin`, `js_shell` are facts about the site and still cache. |
| 2026-09-22 | Two market crawls must not run concurrently | 13x the timeout rate, self-inflicted, and it lands on the gate item already failing. The politeness machinery throttles per host; nothing was throttling *us* across markets. Run them one at a time. |
| 2026-09-22 | **The booking rubric invalidates part of the original 70 labels, and the user spotted it before the scorer did** | The rule was written after those labels were made, so any request-form site labelled `no_match` ("has booking") is wrong under it. Scoped: of 33 `no_match` labels, **16 have no request-form language** and are untouched, **12 are on sites no longer readable**, and **5 are at risk**. Each of the five had its booking link followed to its destination: North Scottsdale Dental (`/book-now/` → two forms, confirm language, no slot picker) and Gentle Dental Ahwatukee (`/request-appointment` → HubSpot form) read as request forms; Sun City Modern Dentistry (Adit widget, which does both) and two sites whose links have since moved are unresolved and await a human. |
| 2026-09-22 | The A/B that reverted the generic escalation **rests partly on labels now known to be wrong on that exact axis** | North Scottsdale and Gentle Dental Ahwatukee were two of the eleven cases cited as "the detector was right 10 of 11 times" on word-only signals. If both flip it is 8 of 11. The revert is unlikely to reverse — cost ($0.0249 vs $0.0705) and couldn't-tell (10.3% vs 29.3%) moved far outside noise and neither depends on these labels — but the recall and precision halves of that comparison do, and both arms will be re-scored once the labels are settled rather than left resting on them. Direction of the damage: these flips make **recall worse**, since they are businesses the engine rejected that actually match. Precision is untouched; the engine never called them matches. |
| 2026-09-22 | **All five at-risk labels flipped, and correcting them moved precision 83.3% → 100%** | Each had its booking link followed to its destination. Three say it in their own words — Sun City Modern Dentistry: *"Use the form below to request your appointment… we will reach out to you first to confirm your appointment or to provide you with an alternative date."* The engine was **more right than the ground truth was**, which is the failure mode a benchmark is least able to notice by itself: a wrong label reads as an engine error. Recall fell 33.3% → 30.0% because true matches grew 15 → 20. Revisions are recorded in a `revisions` block inside the labels file with the evidence for each — a label that changes without a trace is how a benchmark starts agreeing with whatever it is measuring. |
| 2026-09-22 | **The revert of the generic escalation is re-opened**, because it rested on those labels | Under the corrected slice, false negatives went 3 → 7 and they are detector word-only rejections — precisely what the escalation arm was built to fix. Cost ($0.0249 vs $0.0705) and couldn't-tell (10.3% vs 29.3%) still favour settling and do not depend on the labels, but the recall and precision halves of that comparison do. Both arms get re-run against the corrected labels before the decision stands. |
| 2026-09-22 | A 100-business A/B **silently destroyed the 1,000-business verdicts** the enriched labelling set was drawn from | 32 hand labels scored 14, and precision's denominator fell to 2, because most labelled businesses no longer had an engine verdict to join to. Human labelling is the most expensive input in Stage 0 and the join is what makes it worth anything. `run.py` now preserves a larger verdicts file under `verdicts-<market>-n<N>.json` before a smaller run overwrites it, and says so. |
| 2026-09-22 | **What it actually costs to decide precision, from the observed yield** | Each enriched label buys **0.50 scorable positive calls** (57% of the set are engine positives × 88% of answers decidable). At 32 labels and **0 wrong calls**, the gate needs 35 positives → ~70 labels total. But the cliff is steep: 97% true precision needs 138 labels, 95% needs 254. One wrong call roughly doubles the human work and two roughly quadruples it, so the cheap outcome is an engine comfortably above the line and the expensive one is an engine merely near it. |
| 2026-09-22 | **A 1,000-business run with 143 of 229 model calls failed reported its numbers as findings** | The Anthropic credit balance ran out mid-run. The harness printed *"couldn't-tell 32.1% of criteria on READABLE sites"* and *"cost per match $0.02375"* and wrote the verdicts file, with a one-word `(143 failed)` as the only hint. Those figures are descriptions of an outage, and they are **plausible** ones: a failed call becomes a couldn't-tell, so failures push the couldn't-tell rate up and the match count down — the two headline numbers move in precisely the direction that reads as an engine problem. Nothing downstream can tell "the model was unsure" from "the call never completed". `run.py` now aborts above a **2% error rate**, before reporting and before writing anything, prints the actual error text, and exits 2. The verdicts file is the sharper hazard: it is what the hand labels join against, so a bad run silently poisons the most expensive input in Stage 0. |
| 2026-09-22 | Blocked on **Anthropic credits**, not on a key | `preflight.py` passes — the key is valid. The balance is empty, which is a different failure and needs a different fix. No further judging until it is topped up; crawling, scoring and all source work are unaffected. |
| 2026-09-22 | **Precision is 100% on 22 positive calls with zero false positives, and the engine's streak is unbroken** | 45 enriched hand labels. The two `no_match` labels both landed on filler rather than on businesses the engine flagged, so nothing the engine called a match has yet been wrong. The gate still reads UNDECIDED, and correctly: a Wilson lower bound of 85.1% does not clear 90%. **35 clean calls would** — 13 more, about 27 more labels at the measured yield of 0.49 positive calls per label. One wrong call along the way pushes it to 53 calls and ~64 more labels. |
| 2026-09-22 | The enriched design **paid for itself**: 45 labels bought 22 positive calls where 70 random labels bought 6 | An 11× improvement in what a labelled business is worth to the metric that needed it, from changing the sampling rather than the engine. The complete slice is still the only thing that can measure recall, which is why both sets exist. |
| 2026-09-22 | **GATE ITEM 2 PASSES on dental-phoenix: precision 100%, 37 positive calls, 0 false positives, lower bound 90.6%** | 72 enriched hand labels. Blended and absence-only both clear 90%, which matters because the plan deliberately reads them separately — a blended pass can hide a failing absence number, and absence is what the marketing leads with. **Not one false positive has ever been found**: across 37 businesses the engine called a match, the human agreed every time. The caveat is scope — this is one niche of the three the gate asks for, and it is the easiest of them (one criterion, the one the detector covers best). |
| 2026-09-22 | The enriched sampling design is what made this affordable | 72 enriched labels bought 37 positive calls. The same result via a complete slice would have needed roughly **700 labelled businesses**. The design change, not any engine change, is what moved gate item 2 from "needs 2,200 labels" to "needs 72". |
| 2026-09-22 | **Recall is now the only failing gate item**, and the product question narrows to one decision | Coverage answered, precision passing, cost passing at $0.024. Delivered recall is 30% against a 60% target, with a 75% ceiling — and the gap is not crawling: of 20 true matches, 15 are readable and 6 are delivered. Nine businesses whose sites were fetched cleanly and not delivered. Either the engine closes that gap, or gate item 3 gets restated the way item 1 was — a shorter list is not a wrong list, and precision is what protects trust. |
| 2026-09-22 | **RETRACTED: reverting the generic escalation was right on the evidence available and wrong on the evidence that arrived.** Escalating is now the default. | Re-measured on 1,000 businesses against the corrected labels, with the booking rubric in the model's prompt: recall **30.0% → 55.0%**, precision 100% either way but on **41** positive calls rather than 37 (lower bound 91.4% vs 90.6%), couldn't-tell 11.8% → 24.5% (inside the 25% target, thinly), cost per match $0.0236 → $0.0294 (inside the $0.04 budget). Escalating wins recall by **25 points** while the two metrics it costs both stay inside target. **Wrongly-rejected true matches fell from 7 to 1.** |
| 2026-09-22 | **Why the first A/B said the opposite: the model was being asked a question nobody had defined** | "Has no online booking" does not say whether an appointment-*request* form counts, and the model had to guess. The detector's crude rule at least guessed consistently, so it won. Once the rubric told the model that a form saying *"we will contact you to confirm"* is not booking, it could do the job the detector was only approximating. **An A/B between a rule and a model is not a fair test until the model has been told the rule** — the earlier result was not wrong, it was premature, and nothing in the engine changed between the two measurements. |
| 2026-09-22 | The HTML-vs-text mechanism still holds and is why the detector is not deleted | The generic patterns match raw HTML — hrefs, button markup, iframe sources — and the model is shown `Page.text`. It still cannot see the signal. What changed is that it no longer needs to: told what booking means, it reads the page's own words about how appointments work, which is better evidence than a URL fragment. Vendor hits still settle without a model call, because a Calendly embed **is** the booking. |
| 2026-09-22 | **Nothing fails outright on dental any more** | Coverage answered, precision PASSES (100%, LB 91.4%), recall UNDECIDED at 55.0% against a 60% target with a 75% ceiling, cost passes at $0.0294. **Three abstentions separate the engine from gate item 3.** Five of the nine remaining misses are sites that cannot be read at all, so the reachable work is small and specific rather than a general accuracy problem. |
| 2026-09-22 | A composed **home page** arrived in the design language, and it takes a side in §5's unresolved divergence | Saved at `docs/design/home-page.html` (decoded from a 1.3 MB React bundle to the 73 KB page). Its tokens match the design system exactly, so type and colour are settled and adoptable. Its **product shape is not**: the page shows `{{score}}`, `{{tier}}`, *"Move a weight. Everything re-ranks"*, *"Two meters. Accounts researched, accounts watched"* and a watch-and-diff flow — none of which the engine produces. Shipping it as-is would promise scores that cannot be computed and alerts that are not built, on the one page where a claim is loudest. Three lines of its copy are the opposite — *"It stops at drafted. It never sends."*, *"180 we refused to guess about — each with the reason why"*, *"cite the sentence"* — and those are commitments the engine already enforces and measures. Split recorded in `docs/design-system.md` §6: take the visual language and voice now, treat scores/tiers/weights as a proposal to decide with §5, not a design import. |
| 2026-09-22 | **Med spa fails gate item 4 by 7.5×: $0.298 per match against a $0.04 budget.** Couldn't-tell on readable sites is 44.8% against a 25% target. | 1,000 businesses, 398 readable, proof validity 205/205. Only **22 businesses matched every criterion**. This is the first niche measured with a **presence** criterion, and it is the first outright gate failure since coverage. Dental's numbers came from a single absence criterion the detector partly covers; they did not generalise, exactly as the risk was stated before the run. |
| 2026-09-22 | **The cause is which pages get read, not how they are judged** | Split by criterion on readable sites: `no_online_booking` is 28% couldn't-tell, `offers_botox` is **62%**. But the word "botox" appears *anywhere in the pages we fetched* on only **28% of readable sites**, and where it does appear the model finds it **82% of the time**. Judgment is working. The evidence is simply not on the ≤4 pages we read: med spa sites nest treatments (`/services` → `/injectables` → `/botox`) and the crawl reads one level. |
| 2026-09-22 | **`MAX_PAGES = 4` was justified on absence criteria and silently applied to presence criteria, where the economics invert** | The ceiling's stated justification is that "booking signals appear beyond the homepage on only 0.0–1.6% of sites (report §2), so a fourth page buys almost nothing". That is a measurement about **booking**, an affordance that lives in the nav of every page. A named service lives deep in a hierarchy and is mentioned once. The same constant governs both, and nobody noticed the justification did not transfer. |
| 2026-09-22 | **Couldn't-tell compounds multiplicatively across criteria, and the billable unit is the business** | A business matches only when *every* criterion matches. Dental has one criterion and matched 26% of businesses; med spa has two and matched **2.2%**. Cost per match is cost per business ÷ match rate, so a second criterion at 45% couldn't-tell multiplies the bill rather than adding to it. **Every multi-criterion search inherits this**, and the product's own flagship query has two criteria. The cost model was built on a one-criterion market and does not survive contact with a two-criterion one. |
| 2026-09-22 | **RETRACTED within the hour: "the cause is which pages get read" was wrong.** The cause is that the med spa market is half full of businesses that are not med spas. | The page-depth hypothesis was tested before being built on, by crawling deeper into 18 sites where the 4-page read never saw a neurotoxin term. **Only 1 of 18 had it deeper (6%)** — and the sample names say why: *Vela Braids Studio, Bnails Non-Toxic Nail Salon, Sauccy Fades Barbershop, All About The Brow, Queens Beauty*. Nail salons and barbershops do not offer Botox, and their websites never mention it, so couldn't-tell is the **correct** answer. The engine was being honest about businesses that should never have been in the market. |
| 2026-09-22 | **The `expanded` category list is the defect: 543 of 1,000 med spa candidates are Overture's catch-all `spas`, only 307 are `medical_spa`** | Split by category, the difference is not subtle — `medical_spa`: **39% couldn't-tell, 51% offer a neurotoxin**. Everything else: **75% couldn't-tell, 7%**. Same engine, same crawl, same prompt. This is the same class of defect as the 7% wrong-website rate on dental: **candidate quality, upstream of anything the engine does**, and it caps what any amount of engine work can achieve. `benchmarks.json` lists `spas`, `day_spa`, `health_spa`, `float_spa` as expanded categories for a *medical* niche, which was never right. |
| 2026-09-22 | **Med spa still fails gate item 4 even correctly scoped — $0.135 per match, 3.4× over budget** | Restricting to `medical_spa` alone: match rate 2.2% → 6.2%, couldn't-tell 44.1% → 33.7%, cost per match $0.298 → **$0.135**. A large improvement and still a clear failure, and couldn't-tell still misses the 25% target. **So candidate contamination explains roughly half the gap and something else explains the rest.** Do not treat re-scoping the market as the fix; it is one of at least two. |
| 2026-09-22 | The gate's own arithmetic is the thing to attack, not the accuracy | Cost per match is cost per business ÷ match rate, and a two-criterion search multiplies two match rates together. Dental (one criterion) matches 26% of businesses; med spa (two criteria) matches 6.2% even when correctly scoped. **The product's flagship query has two criteria.** Either the billable unit changes, or multi-criterion searches need a match rate that two independent criteria cannot produce. This is an economics question, not an accuracy one, and it is now the central open item in Stage 0. |
| 2026-09-22 | **Markets are now scoped to their niche, and the rule is written down: `expanded` means another name for the same niche, never an adjacent industry** | Dental already followed it — its expanded list is orthodontists, endodontists, periodontists — and runs 84% on-primary and passes its gate. The others did not: med spa listed `spas`/`day_spa`/`float_spa`, HVAC listed `contractor`/`plumbing`. Scoped: med spa **2,440 → 779** candidates with a site, HVAC **2,196 → 685**, dental unchanged. `benchmarks.json` records what each market dropped and why; `run.py` enforces it in `in_niche()`; `test_niche_scope.py` pins it on the actual businesses that caused it. |
| 2026-09-22 | HVAC's `contractor` needed a name rescue rather than exclusion | Only **2% of `contractor` and 7% of `plumbing`** have an HVAC-ish name — the rest are *LEMA Construction*, *A & A Granite & Quartz*, *Gulfside Pool & Spa*. But the ones that do are real HVAC firms (*Arctic Air & Refrigeration*, *ABC Plumbing, Air, Heat & Electric*), so the categories are dropped and those businesses are rescued on the name. Excluding the category outright would have thrown away genuine candidates; including it made 72% of the market not-HVAC. |
| 2026-09-22 | **Dental's gate pass survives the contamination finding** | The obvious worry was that precision 100% came from a contaminated market too. It did not: dental is **84% on-primary** and the remainder are orthodontists and oral surgeons, which are dental. Its category list was correct from the start, its scoping is unchanged by this fix, and its numbers stand. |
| 2026-09-22 | **Every candidate billable unit except the current one is inside budget, in every market. The problem is the unit, not the engine.** | Priced from the measured cost logs: <br>· **business matching EVERY criterion** (today) — dental $0.0236 ✓, med spa **$0.298 ✗**, med spa correctly scoped **$0.135 ✗** <br>· **criterion-match** — $0.0236 / $0.0355 / $0.0229, all ✓ <br>· **business decided** — $0.0073 / $0.0149 / $0.0133, all ✓ <br>· **business researched** — $0.0150 / $0.0165 / **$0.0175**, all ✓ <br><br>The current unit is **the only one whose cost depends on the match rate**, and the match rate is what multiplies across criteria. Cost per business *researched* is near-constant at **$0.015–0.018** across markets with different criteria counts, different contamination and different match rates — because it is just the cost of reading and judging a site. That is a number a pricing model can be built on; cost per match is not. |
| 2026-09-22 | **The $0.04 budget is an assumption, not a measurement — its numerator is an open question in this plan** | Open questions list: *"What do buyers pay per matched lead? — 10 customer interviews, pre-launch."* Nobody knows. So gate item 4 compares a measured cost against a threshold derived from an unvalidated price, which is the same defect gate item 1 had when it compared against "Google's count" and turned out unmeasurable. The risk register already prescribes the response — *"Blended cost per match above $0.05 → **Raise prices or trim allowances** before scaling acquisition"* — and it is a pricing response, not an engineering one. **This does not excuse the engineering finding:** a two-criterion search multiplies two match rates and cost per match compounds. That is real and permanent. What it changes is who owns the fix. |
| 2026-09-22 | **S0-22 is unblocked and is now the highest-value remaining Stage 0 task** | "Rebuild the unit-economics model from measured inputs, with margin stated without breakage." Every input it needs now exists and is measured: cost per business researched ($0.015–0.018, stable), cost per business read cold, gap-fill discovery ($0.0079), match rates by criteria count, and readability by market. It should print margin per plan at the $29/$79/$199 tiers under each billable unit, so **S0-25 (decide pricing) becomes a choice between costed options** rather than a judgement call. |
| 2026-09-22 | **Med spa, correctly scoped: $0.1374 per match, couldn't-tell 35.0%. Both still fail, and the prediction held to within $0.003.** | 779 in-niche businesses, proof validity 261/261, cost per business $0.0085. Predicted $0.135 from the contaminated run's `medical_spa` subset; measured **$0.1374**. That agreement matters more than the number: it means the contaminated data could be reasoned about correctly once the contamination was understood, and re-scoping bought exactly what the arithmetic said it would — **couldn't-tell 44.8% → 35.0%**, cost per match $0.298 → $0.137. Roughly half the gap was contamination. The other half is the two-criterion multiplication, which no amount of scoping touches. |
| 2026-09-22 | **All three niches measured on one engine. Cost per match varies 6×; cost per business read varies 2.4%.** | `dental` 1 criterion: per match **$0.0294 ✓**, per business read $0.0166, match rate 26.0%. `med spa` 2 criteria: per match **$0.1374 ✗**, per read $0.0170, match rate 6.2%. `hvac` 2 criteria: per match **$0.1787 ✗**, per read $0.0168, match rate 5.0%. Gate item 4 passes on the one-criterion market and fails on both two-criterion markets — and **nothing about the engine changes between them**. Proof validity is 100% in all three (326/326 on HVAC). Couldn't-tell on readable sites: 24.5% ✓, 35.0% ✗, 29.6% ✗. |
| 2026-09-22 | **$0.0168 per business read is the most robust number Stage 0 has produced, and it is the one a price should be set against** | It holds to ±0.0002 across three niches with different categories, different criteria counts, different readability, and match rates from 5.0% to 26.0%. It is stable *because* it measures the work actually done — fetching and judging a site — and does not divide by an outcome. Cost per match divides by the match rate, and the match rate is the product of one rate per criterion, so it collapses as criteria are added: 26.0% → 6.2% → 5.0%. **A product whose flagship query has two criteria cannot price against a number that assumes one.** |
| 2026-09-22 | Gate item 4 should be restated the way gate item 1 was, and S0-22 decides how | Item 1 was restated when "Google's count" turned out unmeasurable; item 4 compares against a threshold whose numerator — what a buyer pays per matched lead — is still an open question in this plan. The engineering finding stands on its own and does not go away: two criteria multiply two match rates. What is now measured is that **every alternative billable unit is inside budget in every niche** — per criterion-match $0.0219–0.0294, per decided $0.0120–0.0189, per business read $0.0166–0.0170. S0-22 should print margin per plan under each, so S0-25 chooses between costed options. |
| 2026-09-23 | **S0-22 done: `economics/unit_model.py` prices all four billable units from measured runs, and the current unit is the only one that cannot carry a price** | Allowance each tier sustains at 80% gross margin, **no breakage** (every unit assumed consumed), priced against the **worst** niche because a plan sold to a med spa and an HVAC firm must hold for both: <br><br>· **per business read** — Starter **340**, Growth **927**, Scale **2,335**. Spread across niches **1.0×**. <br>· **per business decided** — 306 / 834 / 2,101. Spread 1.6×. <br>· **per criterion match** — 197 / 538 / 1,355. Spread 1.3×. <br>· **per business matched (today)** — **32** / 88 / 222. Spread **6.1×**. <br><br>Starter at 32 matches a month in the worst niche and 197 in the best is not a plan anyone can write on a pricing page. The same tier holds 340–350 businesses-read across every niche measured. |
| 2026-09-23 | The model refuses estimates, and a test enforces it | It reads `benchmark-<market>.json`, the verdict trace and the cost log, and **exits non-zero naming the missing market** rather than substituting a plausible number — the failure mode that produced the `$0.010 per business` estimate this replaces, wrong by 5×. `test_unit_model.py` pins that no measured cost is reachable as a constant in the code, that breakage is excluded and said so in the output, that allowances price against the worst niche, and that the unmodelled items are printed as loudly as the settled ones. The test caught a real staleness bug on its first run: the summary prose quoted `$0.0166-$0.0170` as literals, so it would have kept asserting today's numbers after a future run moved them — in the part of the output a reader trusts most. Now computed. |
| 2026-09-23 | What the model says it **cannot** settle, printed every run | (1) What a buyer pays per matched lead — still an open question, and the numerator the $0.04 budget came from. (2) **Weekly re-read cost for alerts: S0-20 has never been run, so every figure is first-scan-only and UNDERSTATES the cost of a retained customer.** (3) Gap-fill discovery at $0.0079/business is measured but excluded, because it applies per-niche where open data misses a business and HVAC is worst at 31–48% coverage. An incomplete cost model has to say which direction it is wrong in. |
| 2026-09-23 | **The alert engine's change detector has a 31.7% noise floor on raw HTML and 0.0% on the signals the engine judges** | Measured on 60 dental sites re-read minutes apart, with nothing real changed: raw HTML **31.7%**, visible text **6.7%**, normalised text **5.0%**, detected signals **0.0%**. A third of every weekly alert run would be phantom if built on raw bytes — CSRF tokens, session ids, rotating testimonials, a copyright year. **This had to be measured before the seven-day rate, not after**, because a change rate measured on raw HTML is a measurement of our own hashing and would have been believed: it is the same shape as the "0% of booking links are hidden" artifact and the timeouts blamed on businesses. |
| 2026-09-23 | **Signals being perfectly stable is what makes a cheap alert possible** | The level the engine actually judges on did not move at all across a same-day re-read. So the weekly cycle can be: re-crawl (no model call), compare the signals hash, and pay for a re-judge only when something the rubric could care about moved. That turns the alert engine's marginal cost from "a re-judge per watched business per week" into "a crawl per business plus a re-judge on the few that changed" — and the re-judge is the part that costs money. **S0-23 cannot be modelled until the seven-day rate exists**, but the shape of the answer is now known. |
| 2026-09-23 | A normalisation ordering bug, caught by its own test on first run | The year rule ran before the general digit rule, so *"1902 patients served"* normalised to `YEAR patients served` while *"1841 patients served"* became `N patients served` — two visitor counts reading as a change purely because one looked like a year. The general rule already covers years; the special case only ever needed to handle a time's am/pm, which digit-flattening leaves behind. Fixed, and the test now pins a copyright year, a posted time, a visitor counter and whitespace as *not* changes, while a new dentist, an added service and booking language *are*. |
| 2026-09-23 | **Pricing decided: bill per matched business, banded 1×/2×/3× by sample match rate. My per-read recommendation was rejected and the reasoning is better than mine.** | I recommended switching the meter to business-read because it is the only unit stable across niches. The decision keeps pay-per-match and collapses the spread with bands instead, on grounds I under-weighted: per-read pricing hands the customer the "you pay for junk" complaint the product positioned against, loses to Exa on the comparison buyers actually run (Exa charges nothing for non-matches), reads absurdly beside Scrap.io's 10,000 exports for $35, and breaks the free-count demo by making the interesting number the boring one. **Verified against the measured runs: banding takes the 6.1× spread to 2.34× and every niche lands at or under $0.0687 per credit.** Margins check out exactly — Starter 71.6% (claimed 72), Growth 65.2% (65), Agency 65.5% (65), Watch 85.5% (87), Pack 63.8% (63), free tier $1.37 (claimed ≤$1.40). |
| 2026-09-23 | **The $0.04 cost-per-match gate is superseded by band-specific costs** | It compared a measured cost against a threshold derived from an unvalidated price. The bands replace it: band 1 $0.0294, band 2 $0.0687, band 3 $0.0596 per credit, each measured. Gate item 4 is answered per band rather than in the aggregate that made a one-criterion market look solvent and a two-criterion market look broken. |
| 2026-09-23 | **Gap found in the guardrail: the 1% no-hope stop sits below break-even, so a band-3 search matching 1.0–2.3% loses money** | Checked the scan budget against revenue rather than against itself. A credit covers its own reading only above **2.3% (Starter), 2.8% (Growth/Agency), 2.9% (Pack)** — but the no-hope stop lets any search above **1.0%** proceed. Worked example: Starter, criterion matching 1.5%, 2,400 reads = $40.32 of reading against 36 matches × 3 credits × $0.2417 = $26.10. **Net −$14.22, inside the rules as written.** The daily read caps do not bind either: Starter's 2,500/day sits above its own 2,400-read budget. Two fixes, either alone sufficient: **raise the no-hope stop from 1% to 3%**, or **add a band 4 at 5 credits below 3%** (break-even falls to 1.4%). The first is simpler and costs nothing; the second earns revenue on hard searches instead of refusing them. |
| 2026-09-23 | **Retraction: raising the no-hope stop from 1% to 3% fixed almost nothing, because the stop reads a 25-business sample** | The entry above is right about break-even and wrong about the remedy. The stop is applied to the free count's sample of 25, so the only rates it can observe are multiples of 4%: **0 matches is refused, 1 match (4%) passes, and both the 1% line and the 3% line sit between them.** The change therefore altered the verdict on no search that exists. Worse, one match in 25 has a 95% interval of **[0.7%, 19.5%]** — a search whose true rate is 0.7% still starts, and on Starter that is **−$28** over a full budget, twice the loss the original entry reported. A larger sample does not rescue it: one match in 60 gives [0.3%, 8.9%], still straddling break-even, for $1.01 of reading instead of $0.42. **No affordable sample can settle solvency**, so the sample's job is reduced to quoting a band and refusing the obviously hopeless, and solvency moves to the live run. |
| 2026-09-23 | **Solvency enforced where the evidence actually is: a live-run abort, checked at 200 / 400 / 800 / 1,600 reads** | A scan stops when the one-sided upper bound on its live match rate falls below break-even for its quoted band and plan. **This caps the loss on any single scan at $3.36** (200 reads × $0.0168), on any plan, with any criterion — the first thing in this pricing that is a bound rather than an estimate. The confidence level was measured rather than picked: at 80%, the abort catches a 1% run as early as a coin-flip rule does (−$1.91) while killing a quarter as many healthy runs (12.4% vs 54.8% at a true 3%, 1.6% vs 13.6% at 4%, never at 6%). The runs it still kills sit on the no-hope floor, where a scan earns about nothing anyway. |
| 2026-09-23 | **The daily read caps bounded nothing, and credits are not a budget when nothing matches** | Charging only for matches means a criterion that matches nothing **never depletes a balance**, so the balance is not a limit and the daily cap was the only one — at Starter's 2,500 reads/day that is $42 of reading a day against $29 a month, and Agency's 20,000/day is $336 a day against $199 a month. A cap set above a plan's entire monthly revenue is not a cap. Replaced with a **period read allowance of 11 reads per credit**, derived from the most reading a legitimate run can need (spending a whole balance in the worst band at the no-hope floor: `1 / (3 × 3%)` = 11.1). Worst case per period, nothing ever matching: Starter $22.18 of reading against $29, Growth $73.92 against $79, Agency $184.80 against $199, Watch $7.39 against $19, **Pack $18.48 against $19**. Every paid plan survives; Pack's $0.52 is the thinnest thing in the pricing and is the number to watch. Rounding the allowance up to 12 instead of down to 11 would put Pack at $20.16 against $19 — **at the no-hope floor, "let the customer spend every credit" and "never lose money on a Pack" are the same constraint from opposite sides.** |
| 2026-09-23 | **The quoted band is a ceiling, not a price** | Sampling error cuts both ways, and the other direction is unfair to the customer rather than to us: one match in 25 quotes band 3, but its true rate could be 19%, so a customer would pay three credits a match for something common purely because of who landed in their sample. A completed scan is now billed at **the cheaper of the quoted band and the band its delivered rate earns**. The asymmetry is what lets the confirm screen show a number before anything is spent — what was shown can only go down. |
| 2026-09-23 | **The free tier's cost is its reading, not its credits** | "Free counts ≤ $0.45" and "the free tier costs $1.37" are both true and both measure the wrong thing: they price the credits, and credits are only spent on matches. A free user whose searches match nothing spends no credits at all. Under the read allowance the real figure is **$3.70 per free user per period** (220 reads), bounded and known rather than unbounded and unnoticed — the old 300 reads/day would have been $151 a month at zero revenue. |
| 2026-09-23 | **The CSV export was handing over the whole market for free, and S1-06 is amended rather than defended** | The shipped export wrote `name`, `phone` and `website` for every row including non-matches, on a reasoning recorded in the file itself: knowing *why* a business was skipped is worth more than silently dropping it. That half is right and is kept as `nonMatchSummary` — counts and reasons, no identities. The other half was the hole: billing only for matches means **a criterion nothing satisfies would have exported an entire market's contact list at no charge**, and unlike every other cost path this one has no guardrail that could catch it, because no money is being spent to trigger one. The export now carries matched rows only. Two tests were added that fail if a non-match's name, phone, address or domain appears anywhere in the file. |
| 2026-09-23 | **Gate item 4 restated: "blended cost per match ≤ $0.04" becomes "cost per credit ≤ $0.07 in every band"** | The same defect gate item 1 had. The $0.04 threshold's numerator — what a buyer pays per matched lead — was an assumption nobody had validated, and applying it to a blended aggregate made a one-criterion market look solvent ($0.029) and a two-criterion market look broken ($0.137, $0.179) when the only difference between them was that match rates multiply. Band-specific costs are measured, not assumed: **$0.0294 / $0.0687 / $0.0596 per credit**, and the gate now passes in all three. The engineering finding the old gate was surfacing does not go away and is not excused — a two-criterion search compounds cost per match — it is just no longer scored against an invented number. |
| 2026-09-23 | **Markets per user per quarter added as a headline metric, target ≥ 60% on a second market by day 60** | It is the earliest honest test of whether a subscription is the right shape. A metro niche holds ~300–500 matches against Starter's 120 credits, so the first market is three to four months of supply and renewal then depends on expansion — the only unbounded supply of the four (drip, newly-unblocked, market change, expansion). **If it sits at 1, packs are the honest product and the subscription is not.** That is a pricing-model falsifier, so it belongs in the risk register rather than in a growth dashboard, and it is now in both. |
| 2026-09-23 | **The free count reports a range, not "about 140 matches"** | The founding document's demo is a single number. A 25-business sample cannot carry one: 4 matches in 25 reads 16%, its 95% interval is [5.3%, 36.9%], and on a 2,400-business market that is anywhere between 127 and 886 matches. Printing a midpoint would invent three significant figures out of four observations, in the one product whose whole claim is that it does not. So the count is a range with its sample beside it — read, matched, could-not-be-settled — and it says plainly that reading is what narrows it. A bigger sample does not rescue the point estimate either: one match in 60 still gives [0.3%, 8.9%], for $1.01 of reading instead of $0.42. **This is a real conversion risk and it is taken deliberately.** |
| 2026-09-23 | **The interval is Wilson with a continuity correction, because plain Wilson under-covers exactly where rare searches live** | Plain Wilson at n=25 averages 95.2% coverage, which sounds fine and is not: coverage oscillates with the true rate and bottoms out at **86% near p=0.006** — the low rates where a band-3 search sits, and the worst place in the product to be quietly overconfident. Newcombe's correction costs a little width (0/25 reads [0, 16.6%] rather than [0, 13.3%]) and never dips below nominal: **97.4% mean, 95.1% worst**. Both forms are kept on purpose. A number shown to a customer must not under-cover; the abort's threshold is a decision rule tuned against measured loss and false-abort rates, so it stays on the form it was tuned with rather than being shifted by a change of estimator. |
| 2026-09-23 | **The band is quoted from the cautious end of the sample, not its midpoint — the point estimate was measured unsafe** | Quoting `bandFor(observed rate)` puts the quote a band too cheap **26.4% of the time** when the true rate is 4%, and on a Pack every one of those loses money; at the measured med spa rate of 6.2% it is 6.6%. This was not theoretical — a live sample of the Dallas med spa market drew 4 matches in 25, read 16%, and quoted band 1 on a market that is band 2. **The abort catches it, and that is the problem**: the abort's threshold is break-even *for the quoted band*, so an over-generous quote makes it fire sooner, and the customer is quoted cheap, started, then stopped at 200 reads by our own optimism. The quote now comes from the 80% one-sided lower bound — the same confidence the abort uses, read from the other side. "Too cheap" at 6.2% falls from 6.6% to **0.4%**, and only two sample outcomes in 25 shift band at all (2/25 and 4/25, by one each). Over-quotes are made whole by `settleBand`. |
| 2026-09-23 | **Three bugs the tests passed and a screenshot caught** | All three were found by looking at the built screen, not by any assertion. (1) The sampler drew 25 from the whole market, but only a few hundred businesses per market have been read, so it returned **3 readable sites and called that the sample**; it now draws from the read set, and says so, because that set was chosen by the crawler rather than at random. (2) A zero match rate printed "the rate would be 0.0% rather than 0.0%". (3) **No free proofs appeared on the one market where the product is proven** — the code required a `proof` field and the measured data carries the absence proof in `reason` ("3 relevant page(s) read; no sign of it"), which for an absence criterion *is* the evidence. Each now has a regression test. The lesson is not new here but it keeps being worth paying: a passing suite says the code does what it was told, never that what it was told was right. |
| 2026-09-23 | **The non-match privacy rule was enforced in the export and left wide open on the screen** | Yesterday's entry closed the hole in `csv.ts` and stopped there. `Results.tsx` was still rendering `name`, `addr`, `phone` and `site` for every row whatever its verdict — so the rule held in the file and not on the surface someone would actually read a market's contact list off, which is security theatre rather than a guardrail. Non-matches are now a grouped summary: counts and reasons, no identities. The grouping is also the better shape — "41 sites block automated reading" is something a user can act on, where forty-one nameless rows are not. A test now asserts the screen and the file unlock exactly the same businesses, because the two disagreeing is how this happened. |
| 2026-09-23 | **Overture lists a row per listing, so billing per matched record would charge twice for one practice — 830 of dental Phoenix's 2,778 records with a website (30%) share a domain with another** | Found by accident: a privacy test flagged `eastvalleyimplant.com` appearing in an export beside a locked record. It was not a leak — it was two Overture rows for one practice, "East Valley Implant & Periodontal Center" and "Dr. Joseph Capps". Widening the check found the same shape via shared phone numbers. **A product that bills per matched business has to know what one business is, and the candidate source does not.** Measured duplicates by domain: dental 830 of 2,778, med spa 467 of 2,440, HVAC 225 of 2,196. Only one is billable today because so little is read; at full coverage it is a percentage of every invoice, charged for our supplier's duplicates. The rule is now **one website is one business** (`src/lib/billing.ts`), applied once upstream so the headline, the chips, the list and the file all count the way the invoice does — they previously said 42, 42, 42 and 41 about the same region. The known cost is a genuine multi-location chain on one domain billed once rather than per branch; that is the right way to be wrong, since the user is buying someone to contact. |
| 2026-09-23 | **Choosing which duplicate represents a business is an evidence question before a completeness question** | The obvious rule — keep the fullest record — would have hidden a paid-for match behind an unread duplicate, which is exactly the pair that started this. Records sharing a domain can hold different verdicts, but only because which listings got crawled is an accident of our ordering: one site is read once and has one answer. So the lead is chosen first for having been read, and only then for phone, address and name. Tested directly, with a deliberately sparse matched record beating a complete unread one. |
| 2026-09-23 | **Retraction, same day: "one website is one business" was wrong, and wrong in the expensive direction** | The rule shipped this morning would have collapsed **23 Phoenix records sharing `aspendental.com` into one billable business**, and 21 sharing `toothdoctorarizona.com`, and **59 Dallas med spas sharing `linktr.ee`** — a link-in-bio page used by unrelated businesses. The entry that introduced it called a chain billed once "the right way to be wrong". It is not: under-billing was the smaller half, and the larger half is that **22 of those 23 Aspen Dental practices would have disappeared from the customer's results entirely.** The corrected rule is **one website at one place**: records sharing a domain are the same business only within 200m. Distance separates the two cases sharply — among dental pairs sharing a domain, small groups (2–3 records) are 245 co-located against 120 far apart, while large groups (4+) are 149 co-located against 1,012 twenty kilometres or more apart. One rule covers both, since two listings of one chain branch still merge. Corrected duplicate counts: **dental 326 of 2,778 (11.7%)**, med spa 21 of 2,440 (0.9%), HVAC 10 of 2,196 (0.5%) — the earlier "830 / 30%" figure was counting chain branches as duplicates. A test now fails if any market's business count drops below 80% of its record count, which is the guard the first version needed and did not have. |
| 2026-09-23 | **Overture's website field is not always the business's own site, and a contact read off the wrong site is an invented contact** | Auditing the contact extractor's output rather than trusting it, as the engineering rules require. "Crain David A Dds", a Mesa dentist, carries `ihs.gov` — a federal health portal — and the extractor read a **Maryland** phone number off it. "Custom Dental Ceramics" in Phoenix carries `atlantadentalarts.com`. "AZ Dental" carries `promoplace.com`, a promotional-products shop. "Canyon Lakes Dental Group" in Mesa carries a Colorado Springs practice. Four filters now stand between a page and a published contact, and each exists because the audit caught it failing: a **shared page** (a domain used at two or more distinct places is a chain or platform, so nothing on it belongs to one location); an **attribution test** (a distinctive word from the name, in the page text or the domain); an **area-code test** (a cue-confirmed phone must share the listing phone's area code — this is what finally removed the Maryland number); and **town-only as a caveat rather than proof** — `ihs.gov` says the town because the Indian Health Service has an office there, exactly as a local dentist's site does. A first name is not distinctive either: `ihs.gov` passed for a while on the word "david". |
| 2026-09-23 | **Socials cannot be delivered from what the probe stores, and are refused rather than guessed** | The founding documents promise socials with provenance. Measured across 1,654 readable sites: a social URL appears in **visible text on 9 of them, 0.5%**. Social links are icon anchors, so they live in `href` attributes, and `site_probe.py` keeps text only. The tempting fix — `facebook.com/<business name>` — is exactly the invention this product exists not to make, so the field ships empty with the reason attached and S1-05b adds link targets to the fetcher. |
