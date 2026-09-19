# Stage 0 — Coverage and readability report

Measurements, not estimates. Everything here is reproducible with the scripts in
`stage0/src/`.

**Run date:** 2026-09-19 · **Overture release:** 2026-08-19.0 · **Radius:** 25 miles

**Status:** partial. Candidate coverage (S0-02) and website readability (S0-05) are
measured. The Google baseline (S0-04) and the Foursquare merge (S0-03) are outstanding,
so gate item 1 — open-data coverage ≥ 70% of Google's count — is **not yet answered**.

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

### This is the most important number in the report

The product document targets a couldn't-tell rate of **≤ 25% at launch**. The measured
*floor* — before any model has been asked to judge anything — is **~40%**. No prompt,
model or extraction improvement can go below it, because these sites did not yield
readable text at all.

The target is not reachable as written. Three responses, in order of value:

1. **Attack `blocked` first.** It is the single largest bucket (11–17% of every market)
   and it is the most addressable: 403 and 429 mean a server answered and refused us, not
   that the business has no site. Better crawler identity, backoff, retry scheduling and
   in some cases a different egress path recover much of this. Every point recovered here
   comes straight off the floor.
2. **Count `social_only` and `no website` as a product feature, not a failure.** The
   product document already proposes an "include no-website businesses" toggle, which web
   agencies value. Those businesses should leave the couldn't-tell denominator and become
   their own answer.
3. **Restate the target.** Even with `blocked` fully solved, the floor lands near 25%,
   leaving no headroom for genuine judgment uncertainty. A launch target of ≤ 30%, falling
   to ≤ 20% by year 1, is defensible. Publishing an honest 30% is on-brand for a product
   whose third principle is that uncertainty is shown, not hidden.

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

## 6. What this changes

| Finding | Consequence |
|---|---|
| Couldn't-tell floor ~40%, vs a ≤25% target | Target must be restated; `blocked` recovery becomes a Stage 0 workstream |
| `blocked` is 11–17% of all candidates | New task: crawler identity, backoff and retry policy |
| Booking signals sit on the homepage ~99% of the time | Critique 3 downgraded; shallow crawl is cheaper than feared, which helps cost per business |
| Match rates of 37–63% on the flagship searches | Unit economics likely better than the 15% typical case — verify against precision before relying on it |
| Vendor concentration is high within a niche | Per-niche detector catalogues are worth building; they are the cheapest precision available |
| Open data serves a metro in 6–10s for free | Candidate supply is not the bottleneck; completeness (S0-04) still might be |
| A state-wide search is 14,789 candidates (~$148 cold) | The area guardrail must live in the region picker, not behind it |

## 7. Outstanding before gate item 1 can be answered

- **S0-04** — Google Places baseline count per niche × metro. Needs an API key. Until then
  we know how many businesses open data *has*, not what share of reality that is.
- **S0-03** — Foursquare merge and dedupe, which can only raise the counts above.

Reproduce everything here with:

```bash
pip install duckdb httpx
python3 stage0/src/coverage/overture_extract.py
python3 stage0/src/coverage/site_probe.py --sample 200 --extra-pages 3
```
