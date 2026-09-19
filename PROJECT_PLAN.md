# Small Fish — Project Plan

The single source of truth for what is being built, in what order, and what must be true
before moving on. Founding documents live in `docs/source/`; the review that reshaped this
plan is `docs/critique.md`.

**Last updated:** 2026-09-19 · **Stage:** 0 — Prove it

---

## How to use this plan

- Every task has an ID (`S0-01`), an owner, and a definition of done. Tick the box only
  when the definition of done is met, not when the work feels finished.
- **Gates are hard.** A stage does not start because the previous one ran out of calendar;
  it starts because the gate passed. A failed gate is a decision point, not a delay.
- Numbers in this plan are *targets to be replaced by measurements*. When a real number
  arrives, edit the plan and note it in the Decision log.
- Anything that contradicts `docs/source/` deliberately is listed in **Changes from the
  founding documents** with the reason.

## Status dashboard

| Stage | Status | Gate | Gate met? |
|---|---|---|---|
| 0 · Prove it | **In progress** | Coverage ≥ 70% and precision ≥ 90% on 3 niches | — |
| 1 · Launch | Not started | 50 paying users; live precision ≥ 90% | — |
| 2 · Grow | Not started | 300 paying; churn ≤ 6%; cost/match ≤ $0.04 | — |
| 3 · Compound | Not started | 1,000 paying; ≥ 50% warm reads | — |
| 4 · Relevance layer | Not started | — | — |

### Live numbers (replace targets with measurements as they arrive)

| Metric | Target | Measured | Date |
|---|---|---|---|
| Open-data candidates per metro niche | — | 2,435–3,126 | 2026-09-19 |
| Candidates with a website | — | 82.7–93.1% | 2026-09-19 |
| Open-data coverage vs Google, per niche | ≥ 70% | — *(blocked: needs Places key)* | — |
| **Couldn't-tell floor** (unreadable sites) | ≤ 25% | **39.6–43.1%** ⚠ | 2026-09-19 |
| — of which bot-blocked (403/429) | — | 11.3–16.9% | 2026-09-19 |
| — bot-blocked recoverable, honest strategies | — | **3.8%** (75/78 stay blocked) | 2026-09-19 |
| Booking signal found, judgeable sites | — | 36.7–63.2% | 2026-09-19 |
| Booking found only beyond the homepage | — | 0.0–1.6% | 2026-09-19 |
| Match precision, blended | ≥ 90% | — | — |
| Match precision, absence criteria only | ≥ 90% | — | — |
| Known-match recall | ≥ 60% | — | — |
| Cold cost per business | ≤ $0.010 | — | — |
| Warm cost per business | ≤ $0.002 | — | — |
| Blended cost per match | ≤ $0.04 | — | — |
| Weekly profile change rate (drives alert cost) | measure | — | — |
| p95 time to first match, cold market | measure | — | — |

⚠ **The couldn't-tell target is not reachable as written.** The measured floor — sites
that yield no readable text at all, before any judgment is attempted — is ~40% against a
≤25% target. See `docs/stage0-coverage-report.md` §2 and tasks S0-26 / S0-27.

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

---

## Stage 0 — Prove it

**Goal.** Establish, with measurements rather than estimates, that Small Fish can find the
candidates, judge them accurately, and do both for less than it charges.

**Gate to Stage 1.** All four must hold on three real niche searches:

1. Open-data coverage ≥ 70% of Google's count per niche (or a costed gap-fill plan that
   keeps blended cost per match ≤ $0.04).
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
  domain, phone and address proximity. *Done when:* merged candidate set with a documented
  dedupe rate.
- [ ] **S0-04 · Establish the Google baseline count.** Places API Text Search per niche ×
  metro, storing place IDs only, to answer "what fraction of Google's businesses does open
  data see?". *Done when:* a coverage percentage per niche, with the query cost recorded.
  *Blocked on:* a Google Places API key.
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
- [ ] **S0-30 · Keep the cheap, correct parts of polite crawling** even though they buy no
  recovery: honour `Retry-After`, exponential backoff on 429, a crawler identity page at
  the URL in our user agent. Correct behaviour, not a recovery strategy.
- [ ] **S0-31 · Give "blocked" its own user-facing status**, separate from couldn't-tell.
  "This site blocks automated reading" is specific, honest and actionable — the user can
  open it themselves — and may be a weak buying signal for web agencies.
- [ ] **S0-27 · Restate the couldn't-tell target from measured data.** Now the *primary*
  response to the floor rather than the fallback, since S0-26 refuted the recovery route.
  Move no-website and social-only businesses out of the denominator and into their own
  answer (the product document already proposes the toggle), then set a launch target the
  engine can hit. Current evidence supports ≤ 35% at launch, ≤ 25% by year 1. *Done when:*
  the product document's ≤25% is replaced by a defended number.
- [ ] **S0-28 · Per-niche booking detector catalogues.** Vendor concentration within a
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
- [ ] **S0-10 · Technology detector.** Booking widgets (Calendly, Vagaro, Zocdoc, Mindbody,
  Jane, Boulevard, Square, Acuity), chat widgets, CMS, ad pixels, quote forms. *Done when:*
  detection settles a measured share of criteria with no model call — record that share, it
  is the main cost lever.
- [ ] **S0-11 · Fact profile extraction.** One model pass per business → services,
  specialties, booking method, contact routes, staff count, locations, languages, ownership
  hints, and quotes with source URLs. Store the profile, never full page copies.
- [ ] **S0-12 · Criteria judge.** Cheap signals first, then a small model, with a stronger
  model on borderline cases and a random audit sample. Returns verdict, proof quote,
  confidence word.
- [ ] **S0-13 · Absence-proof rule.** A "no X" verdict requires that the X-relevant pages
  were actually read and no positive signal was found; otherwise couldn't tell. *Done
  when:* unit-tested against fixtures including the hard cases (widget in an iframe,
  booking link only on a location sub-page, script-injected widget).
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
  and cost.
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

- [ ] **S1-01 · Search box and criteria confirmation** with editable chips, per-criterion
  "how this is checked" lines, and one clarifying question for vague terms.
- [ ] **S1-20 · Map region picker.** The visual half of S0-29: a map that opens on the
  parsed location, a draggable radius, presets for city, county and state, and freehand
  polygon drawing. Shows the live candidate count as the region changes, because the
  region is what drives cost — this is the screen where a user can casually draw half a
  state and create a 20,000-candidate scan. *Depends on:* S0-29.
- [ ] **S1-21 · Area cost guardrail.** When a region's candidate estimate exceeds the scan
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
- [ ] **S1-06 · Export** to CSV and Google Sheets with proof columns and duplicate
  protection.
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
| 2026-09-19 | Source documents kept as PDFs of record in `docs/source/`, not re-authored as markdown, to avoid a second diverging copy | Single source of truth |
| 2026-09-19 | Critique finding 3 (absence criteria need deep crawls) **downgraded** | Measured: booking signals appear only beyond the homepage in 0–1.6% of cases. Concern stands only for booking with no vendor fingerprint, which S0-16 must find. |
| 2026-09-19 | Couldn't-tell ≤25% declared unreachable as written | Measured floor of ~40% before any judgment. S0-26 attacks it, S0-27 restates it. |
| 2026-09-19 | Map region selection promoted from a half-sentence to explicit scope (S0-29, S1-20, S1-21) | It was named in the product document but had no tasks, no UI detail and no cost treatment, while being the main driver of scan cost. |
| 2026-09-19 | Bot-blocking reclassified from workstream to cost of doing business; the critique's "most addressable" claim **retracted** | Measured: 96.2% stay blocked under every honest strategy. Presenting as a browser recovers 1 readable site in 78 — not a trade worth making. |
| 2026-09-19 | Restating the couldn't-tell target (S0-27) becomes the primary response to the ~40% floor | The recovery route it was meant to back up has been refuted. |
