# Stage 0 — Coverage and readability report

Measurements, not estimates. Everything here is reproducible with the scripts in
`stage0/src/`.

**Run dates:** 2026-09-19 (first crawl), 2026-09-20 (re-crawl with per-niche catalogues) · **Overture release:** 2026-08-19.0 · **Radius:** 25 miles

**Status:** gate item 1 is **answered, and the answer is no** — see §7. Candidate supply
(S0-02), website readability (S0-05) and the Google baseline (S0-04) are all measured.
The Foursquare merge (S0-03) is still outstanding and can only raise the coverage numbers,
never lower them.

*Supersedes the previous status line, which read "the Google baseline (S0-04) and the
Foursquare merge (S0-03) are outstanding, so gate item 1 is not yet answered." S0-04 has
since run, at $8.22 of API spend.*

---

## 1. Candidate supply from open data

`python3 stage0/src/coverage/overture_extract.py`

| Market | Candidates | Primary category | Expanded | With website | With phone |
|---|---|---|---|---|---|
| Med spas · Dallas | 3,009 | 852 | 2,157 | 82.7% | 95.0% |
| Dental · Phoenix | 3,126 | 2,654 | 472 | 90.7% | 99.3% |
| HVAC · Tampa | 2,435 | 700 | 1,735 | 93.1% | 99.8% |

Queries run in 6–10 seconds against the public 10.5 GB parquet release over HTTPS, with
no download and no AWS credentials. The `bbox` column gives row-group pruning, so a
metro-sized query touches a small fraction of the dataset. **Operationally, open data is
cheap and fast to serve candidates from** — the remaining question is only whether it is
*complete* (S0-04).

Category values were discovered by scanning the release rather than guessed. The niche
definitions are narrower than they look: `medical_spa` alone is 852 of the 3,009 Dallas
candidates, with the rest coming from the related-type expansion the product document
calls "suggested related types".

## 2. Website readability — the couldn't-tell floor

`python3 stage0/src/coverage/site_probe.py --sample 200 --extra-pages 3`

200 primary-category businesses per market, homepage plus up to 3 pages selected by link
extraction. robots.txt honoured, crawler identified, 1.5s per-domain throttle. Sites where
*our own* network failed are excluded from every rate rather than blamed on the business.

| Outcome | Med spa · Dallas | Dental · Phoenix | HVAC · Tampa |
|---|---|---|---|
| **ok** (judgeable) | 114 (59.4%) | 119 (60.4%) | 111 (56.9%) |
| blocked (403/429 — bot protection) | 22 | 31 | 33 |
| dead (connection failed) | 12 | 18 | 24 |
| http_error (other 4xx/5xx) | 11 | 10 | 13 |
| thin (< 400 chars of text) | 11 | 11 | 9 |
| js_shell (empty without rendering) | 7 | 2 | 4 |
| social_only | 8 | 1 | 0 |
| timeout | 4 | 4 | 0 |
| robots_blocked | 3 | 1 | 1 |
| **Couldn't-tell floor** | **40.6%** | **39.6%** | **43.1%** |

### Superseded — see §2b and §2c

This section originally reported a ~40% "floor" and called the product document's ≤ 25%
couldn't-tell target unreachable. **Both claims were wrong**, for two separate reasons
found by later measurement:

- Part of the 40% was our own crawler timing out, not sites being unreadable (§2b).
- The rest counted three different answers as one. Split properly, genuine uncertainty is
  **19.0–25.3%** and the ≤ 25% target is close to met (§2c).

The outcome table below is from the first crawl and is kept for the record. The current
numbers are in §2b.


## 2a. Bot-blocked sites are mostly unrecoverable — a second correction

`python3 stage0/src/coverage/blocked_recovery.py`

The earlier version of this report, and `docs/critique.md` behind it, called bot-blocking
"the most addressable" part of the floor. **That was wrong, and the test says so.** Five
strategies against all 78 blocked hosts:

| Strategy | Recovered any content | Fully readable |
|---|---|---|
| A · baseline (bot UA, minimal headers) | 1.3% | 1.3% |
| B · bot UA + complete browser header set | 0.0% | 0.0% |
| C · as B over HTTP/2 | 0.0% | 0.0% |
| D · as C after a 20s delay | 1.3% | 1.3% |
| E · presenting as Chrome *(measurement only)* | 6.4% | **1.3%** |

**75 of 78 hosts (96.2%) stay blocked under every honest strategy.** These are
Cloudflare-class challenge walls, not politeness failures: they do not care about header
completeness, protocol version or patience.

Strategy E is the important row, and it is weaker than it first looks. It exists only to
price what principle 7 costs, and the answer is: almost nothing. Presenting as Chrome got
past 5 of 78 walls, but **4 of those 5 landed in a JavaScript shell** with no readable
text — so they would still need headless rendering at higher cost. Exactly **one site in
78** became genuinely readable by abandoning honest identification. That is not a trade
worth making, and the principle stays.

### What this changes

Bot-blocking moves from "workstream" to "cost of doing business". Roughly 11–17% of every
market is simply not readable by anyone who crawls politely, and the couldn't-tell floor
is therefore closer to a fact about the web than a bug to engineer away.

Three things follow:

1. **S0-26 narrows.** Keep honouring `Retry-After`, keep backoff, keep the crawler
   identity and contact page — they are correct and cheap — but stop expecting a recovery
   rate from them.
2. **The target restatement (S0-27) is now the primary response**, not the fallback.
   *Done — see §2c. The restated target keeps the product document's ≤ 25%, measured
   against genuine uncertainty rather than against blocked and no-site combined.*
3. **Blocked deserves its own user-facing status**, distinct from "couldn't tell". "This
   site blocks automated reading" is a specific, honest answer a user can act on — they
   can open it themselves — and it is a better experience than an unexplained shrug. It
   may even be a weak buying signal for web agencies.

## 2b. Timeouts were measuring our crawler, not the web

Three crawls of the **same sites, same sample seed, same fetcher** produced:

| Market | Timeouts, crawl 1 | crawl 2 | crawl 3 |
|---|---|---|---|
| Med spa · Dallas | 4 | 20 | **48** |
| Dental · Phoenix | 4 | 32 | — *(stopped)* |
| HVAC · Tampa | 0 | 6 | — |
| Vet · Columbus | 1 | 2 | — |

Every other outcome — blocked, dead, thin, js_shell, social_only — moved by at most 4
across the same runs. Only timeouts grew, and they grew twelvefold on one market. Adding
a retry made it *worse*, because retrying doubles the load on hosts that are already
struggling.

A figure that grows twelvefold over unchanged input is measuring the measurer. Timeouts
are therefore classified with `probe_error` as **ours, not theirs**, excluded from every
business-facing rate and reported separately as crawl quality. This follows the rule the
codebase already had: never blame our environment on the business.

The third crawl was stopped once this was clear, rather than collecting more of it.

**With timeouts excluded, the three crawls agree**, which is the point:

| Market | Judgeable, crawl 1 | Current |
|---|---|---|
| Med spa · Dallas | 59.4% | 56.6% |
| Dental · Phoenix | 60.4% | 59.0% |
| HVAC · Tampa | 56.9% | 56.8% |
| Vet · Columbus | 65.5% | 66.7% |

There is a warning here for the product, not just the measurement. The alert engine
re-crawls saved searches weekly. If sustained crawling degrades our own success rate this
easily, alert runs need rate discipline and their own quality metric, or they will quietly
report businesses as unreadable that are nothing of the kind.

## 2c. The ≤ 25% couldn't-tell target is close to met — a retraction

`python3 stage0/src/coverage/couldnt_tell_target.py`

The earlier "unreachable" verdict came from counting three different answers as one
number. Split apart:

| Market | All-not-ok | Blocked | No site | **Genuine couldn't-tell** |
|---|---|---|---|---|
| Med spa · Dallas | 43.4% | 16.6% | 5.5% | **22.6%** |
| Dental · Phoenix | 41.0% | 20.5% | 0.6% | **20.0%** |
| HVAC · Tampa | 43.2% | 17.9% | 0.0% | **25.3%** |
| Vet · Columbus | 33.3% | 13.7% | 0.9% | **19.0%** |

- **Blocked** is a specific, actionable answer — the user can open the site themselves —
  and 96% of it is unrecoverable by any honest means (§2a). It now has its own verdict
  (S0-31), not a shrug.
- **No site / social-only** is a different answer entirely, and the product document
  already proposes surfacing it as one.
- **Genuine couldn't-tell** — reachable but too thin, dead, erroring or JavaScript-only —
  is **19.0–25.3%**, meets ≤ 25% on three markets of four, and is the only bucket a better
  engine can move.

**Restated target:** genuine couldn't-tell ≤ 25% at launch, ≤ 15% by year 1, with blocked
and no-site reported separately and never counted as uncertainty. That is the product
document's original number, kept, now that it is measured against the thing it describes.

## 2d. Per-niche booking catalogues (S0-28)

Booking software is strongly vertical-specific. Adding 43 vendors across veterinary,
dental, med spa and trades, measured on the same sites:

| Market | Vendor-identified detections | Booking signal found |
|---|---|---|
| Vet · Columbus | 2 → **21** | 26.2% → **39.3%** |
| Med spa · Dallas | — → 42 | 63.3% |
| Dental · Phoenix | — → 18 | 48.1% |
| HVAC · Tampa | — → 34 | 40.7% |

The med spa market's top vendor is now Aesthetic Record at 14, which appeared in no list
before. Vet detections are led by AllyDVM, TeleVet, Covetrus, ezyVet and Vetstoria — none
of which any general catalogue would contain.

**This should be read as a correction, not a win.** More booking detected means *fewer*
"no online booking" matches, because the earlier match rates counted businesses whose
booking we simply could not see:

| Market | Matches before | After |
|---|---|---|
| Med spa · Dallas | 35 | **26** |
| Dental · Phoenix | 58 | **42** |

Those 9 and 16 businesses were false matches — exactly the failure the product document
says destroys trust, and exactly what §3 warned the earlier match rates might contain. The
optimistic 37–63% match rates in §3 are correspondingly too high.

### Site quality varies by niche in ways that matter

Mean homepage text: dental 6,423 chars, med spa 4,012, HVAC 3,905. Dental sites are
substantially richer, which should make service criteria ("offers implants") easier to
judge there than in HVAC. WordPress dominates everywhere (52–56 of ~190 per market),
followed by Wix, GoDaddy Website Builder and Squarespace — a small set of platforms worth
special-casing in extraction.

## 3. Technology detection — the cost lever

Share of judgeable sites where a signal was found, with no model call:

| Signal | Med spa · Dallas | Dental · Phoenix | HVAC · Tampa |
|---|---|---|---|
| Online booking | 63.2% | 43.8% | 36.7% |
| Quote form | 24.0% | 23.1% | 45.8% |
| Chat widget | 4.8% | 6.2% | 6.7% |

Top booking vendors by niche — Vagaro, Boulevard, Square, Mindbody (med spa); NexHealth,
Dentrix (dental); ServiceTitan, HousecallPro, Jobber (HVAC). Vendor concentration is high
within a niche, which is good news: a per-niche detector catalogue covers most of the
market with a short list.

**Implied match rates for the flagship searches.** If "no online booking" means "no
booking signal found", the match rate among judgeable sites is 36.8% for med spas, 56.2%
for dental and 63.3% for HVAC — far above the 15% "typical" case in the unit-economics
model, and above the 30% "broad search" case. At those rates the economics look
considerably better than planned. **This is the most encouraging finding in the report**,
and it should be treated as provisional until precision is measured: an undetected booking
system inflates the apparent match rate and produces a false match at the same time.

## 4. A correction to `docs/critique.md`

Critique finding 3 argued that absence criteria would be badly served by a shallow crawl,
because booking links hidden on deeper pages would produce false matches. **The data only
partly supports that.**

Booking signals found *only* beyond the homepage:

| Market | Sites considered | Found only beyond homepage |
|---|---|---|
| Med spa · Dallas | 125 | 2 (1.6%) |
| Dental · Phoenix | 130 | 1 (0.8%) |
| HVAC · Tampa | 120 | 0 (0.0%) |

When a business has online booking, it advertises it on the homepage almost every time.
A homepage-plus-linked-pages read misses it in roughly 1 case in 100, not 1 in 10.

The concern is therefore **downgraded but not withdrawn**, for two reasons. First, this
measures only *detectable* booking — a bespoke booking form with no vendor fingerprint is
invisible to both this probe and the detector, and would be a false match that this
measurement cannot see. Second, 1% of shown matches being wrong from this cause alone eats
a tenth of the error budget at a 90% precision target. The absence-proof rule (S0-13)
stays, and the hand-labelled benchmark (S0-16) is still the only way to find the
undetectable cases.

Note also that link extraction is doing real work here: an early version guessed URLs from
a fixed path list and 18 of 24 guesses returned 404, which would have made this number
look artificially reassuring. Selecting links off the homepage raised extra-page success
to 41 of 48.

## 5. Location shapes and why the area guardrail matters

`python3 stage0/src/coverage/region_demo.py`

All five location shapes the product document names resolve through one interface and
report a candidate count before anything is spent. Med spa categories, Dallas:

| Shape | Region | Candidates | ~Area (sq mi) | Query |
|---|---|---|---|---|
| Radius 5 mi | Dallas, TX | 304 | 79 | 2.0s |
| City | Dallas, US-TX | 820 | 882 | 9.6s |
| County | Dallas County, US-TX | 1,476 | 928 | 3.5s |
| Drawn polygon | North DFW | 2,851 | 1,348 | 2.7s |
| Radius 25 mi | Dallas, TX | 3,009 | 1,963 | 8.1s |
| **State** | **Texas, US-TX** | **14,789** | **570,714** | **22.6s** |

The 25-mile radius count matches `overture_extract.py` exactly at 3,009, which
cross-validates the two independent query paths.

**The state row is the argument for the area guardrail (S1-21).** One Texas-wide med spa
search is 14,789 candidates. At the planned ~$0.01 cold cost per business, that is roughly
**$148 of scanning for a single search**, on a plan that sells for $79 a month. Nothing in
the search box stops a user from asking for it, and the product document's promise to
"count from a sample and unlock progressively" has no screen attached to it.

The guardrail therefore needs to be part of the region picker rather than a later safety
net: show the candidate estimate as the region changes, and make progressive unlock the
default above a threshold. The estimate is cheap — 2–23 seconds here, and far less once
the knowledge base is warm — so there is no reason to charge before showing it.

County and state boundaries come from Overture Divisions, the same release as the places,
so no new data source is introduced. Boundaries are cached locally after first lookup.

## 5a. Does any of this generalise beyond the three niches?

A fair objection to everything above: med spa, dental and HVAC all have vendor
catalogues behind them, so of course they work. The test is a vertical with no
catalogue at all.

**Vet clinics, Columbus OH**, searching for *"independent vet clinics offering
exotic-pet care, not part of a group"* — criteria that share no keywords and no vendors
with the other three markets. 404 candidates found, 120 probed.

| | Vet · Columbus |
|---|---|
| Judgeable | 65.5% — **the best of the four markets** |
| Sites where the plan found matching links | 73 of 84 |
| Booking vendors recognised | 2 (Calendly, Acuity) of 22 detections |

The crawler went to services, treatments, about and locations pages — derived from the
criteria's own words, with no catalogue consulted. It worked at least as well as the
catalogued markets.

The vendor column is the honest part: only 2 of 22 booking detections matched a known
vendor, because veterinary booking runs on Vetstoria, PetDesk and Weave, none of which
are in our list. **The generic layer carried the unknown vertical, exactly as intended.**

### An important nuance about the homepage finding in §4

Vets showed booking *only* beyond the homepage in **7.1%** of cases — four to nine times
the 0–1.6% seen in the other three markets. The cause is not that vets are different: it
is that the vet check plan targets services and locations pages, because that is what the
user asked about, so booking was only ever found incidentally.

The lesson is precise, and it validates the check-plan design rather than undermining it:

> The 0–1.6% figure in §4 holds **when the criterion is booking and the plan targets
> booking pages.** When the crawl is aimed elsewhere, the same signal hides four to nine
> times more often.

So a shallow crawl is only safe if it is a *criterion-targeted* shallow crawl. A fixed
page list — which is what the probe originally used — would have been unsafe for any
criterion it was not written for. That is the whole argument for S0-32.

It is also a caution against over-generalising from four markets: the rate at which
evidence hides below the homepage is a property of the vertical and the criterion
together, and it must be re-measured whenever either changes.

## 6. What this changes

| Finding | Consequence |
|---|---|
| Couldn't-tell floor ~40%, vs a ≤25% target | Target must be restated; `blocked` recovery becomes a Stage 0 workstream |
| `blocked` is 11–17% of all candidates | New task: crawler identity, backoff and retry policy |
| Booking signals sit on the homepage ~99% of the time | Critique 3 downgraded; shallow crawl is cheaper than feared, which helps cost per business |
| Match rates of 37–63% on the flagship searches | Unit economics likely better than the 15% typical case — verify against precision before relying on it |
| Vendor concentration is high within a niche | Per-niche detector catalogues are worth building; they are the cheapest precision available |
| Open data serves a metro in 6–10s for free | Candidate supply is not the bottleneck; completeness is — see §7 |
| Overlap ≥ 70% holds for 1 niche of 4; HVAC is 31–48% | Gate item 1's first half fails. Foursquare (S0-03) is the cheapest lever on it |
| Gap-fill clears $0.04/match in 2 of 3 priced markets cold, 3 of 3 warm | Gate item 1's escape clause fails cold. The binding constraint is **match rate**, not coverage |
| A state-wide search is 14,789 candidates (~$148 cold) | The area guardrail must live in the region picker, not behind it |

## 7. Gate item 1, answered (S0-06)

Gate item 1 reads:

> Open-data overlap ≥ 70% of Google's places per niche **(or a costed gap-fill plan that
> keeps blended cost per match ≤ $0.04)**.

Both halves are now measured. **Neither is satisfied across the benchmark niches, so gate
item 1 does not pass as written.**

### 7a. The overlap test — one niche of four

`python3 stage0/src/coverage/google_baseline.py` · 240 cells across four metros, 257
requests, $8.22. Reported as a band because 28.5% of Google's places sit where Overture
has *a* business under a name string matching cannot reconcile (§ the 2026-09-21 decision
log entry): **strict** counts only confident matches, **generous** counts every ambiguous
one as a match. Reality is in between.

| Niche · metro | Strict | 95% CI (strict) | Generous | ≥ 70%? |
|---|---|---|---|---|
| Veterinary · Columbus | 73.2% | 64.2 – 83.4% | 86.0% | **yes**, on both readings |
| Dental · Phoenix | 63.8% | 60.1 – 68.1% | 94.3% | only on the generous reading |
| Med spa · Dallas | 45.4% | 38.2 – 52.8% | 79.3% | only on the generous reading |
| HVAC · Tampa | 31.1% | 22.1 – 41.5% | 47.8% | **no**, on every reading |

Only veterinary clears 70% without having to assume the ambiguous cases away. Dental's
strict confidence interval tops out at 68.1%, so dental does not clear it on the strict
reading even at the optimistic end of sampling error. HVAC fails by a wide margin however
the ambiguity is resolved, which is the one unambiguous result in the table.

### 7b. The escape clause — fails cold in one of three priced markets

`python3 stage0/src/engine/gapfill_cost.py`. Discovery is priced from the S0-04 run
itself (257 requests → 1,046 places → **$0.0079 per business discovered**), gap-fill buys
only the share Overture is missing, and read cost is the **measured** S0-17 cost per
business, not the planning estimate.

| Market | Coverage | Match rate | Discovery / match | Read / match | Total | vs $0.04 |
|---|---|---|---|---|---|---|
| Med spa · Dallas | 45% | 21.5% | $0.0200 | $0.0394 | **$0.059** | **over** |
| Dental · Phoenix | 64% | 31.8% | $0.0090 | $0.0240 | $0.033 | ok |
| HVAC · Tampa | 31% | 37.2% | $0.0146 | $0.0239 | $0.038 | ok |
| Veterinary · Columbus | 73% | — | — | — | — | no judged criteria yet |

**The framing "the gap-fill is too expensive" is wrong, and worth correcting before it
becomes the received version.** For med spa, buying the entire coverage gap costs $0.0200
per match. Reading costs $0.0394. At *perfect* coverage — no gap-fill at all, not one
Google request — med spa would still cost $0.0394 per match against a $0.04 budget, which
clears it by six hundredths of a cent. Med spa is marginal on reading alone; the gap-fill
is what tips an already-marginal market over, not what breaks it.

What makes med spa marginal is its **match rate of 21.5%**, the lowest of the three. Every
business read is paid for and only a fifth become matches, so the non-matches are carried
by a smaller number of matches. HVAC has the worst coverage in the benchmark (31%) and
still clears the budget, because 37.2% of what it reads matches.

### 7c. It is a cold-market failure, which is Change 11 with a price on it

| Market | Cold read | Warm read | Break-even read cost |
|---|---|---|---|
| Med spa · Dallas | $0.059 | $0.029 | $0.0043 per business |
| Dental · Phoenix | $0.033 | $0.015 | $0.0099 per business |
| HVAC · Tampa | $0.038 | $0.020 | $0.0095 per business |

Every market clears the budget on a warm read. The first pass over a market loses money
and later passes do not — which is exactly the cold-market problem `PROJECT_PLAN.md`
names as Change 11, now with a number against it. The break-even column is the useful
one: med spa needs the read cost to come down to **$0.0043 per business**, roughly half
what is measured today, before its first pass pays for itself.

### 7d. What this does and does not settle

- **Does not settle:** precision. A cheap wrong answer is not a win, and gate item 2 still
  needs the hand-labelled set. S0-16 currently holds 142 labels across 2 markets, which
  preflight reports as **THIN — too few to measure precision**.
- **Does not settle:** veterinary's economics, which has no judged criteria yet, so its
  73% coverage buys a row with three dashes in it.
- **Can only improve:** S0-03, the Foursquare merge, raises coverage and lowers the
  gap-fill share. It is blocked on a free `HF_TOKEN` and is the cheapest remaining lever
  on the overlap half of the gate.
- **Is a decision, not a measurement:** whether "one niche of four passes the overlap test,
  and two of three priced markets clear the cost budget cold" is a go. The measurements
  say what they say; the gate says ≥ 70% *per niche*, and three niches are below it.

Reproduce everything here with:

```bash
pip install duckdb httpx
python3 stage0/src/coverage/overture_extract.py
python3 stage0/src/coverage/site_probe.py --sample 200 --extra-pages 3
python3 stage0/src/coverage/google_baseline.py     # §7a — spends money, ~$8
python3 stage0/src/engine/gapfill_cost.py          # §7b, §7c — free, reads what is on disk
```
