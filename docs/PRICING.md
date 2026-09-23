# Small Fish — Pricing Decision

**Date:** 2026-09-23 · **Status:** decided, pending the 10 customer interviews
**Live source:** https://claude.ai/code/artifact/dd305741-eda8-4bbc-a5db-c9ba4f7af8fc

This file is the committed snapshot of the pricing decision. Where it disagrees with
the founding documents, this file wins. Where it disagrees with measurements in
PROJECT_PLAN.md, the plan wins and this file gets updated.

## 1. The decision

Small Fish keeps billing **per matched business**, and **bands the rate by how rare the
match is**. The band is shown before anything is spent. Non-matches and "couldn't tell"
stay free.

We do NOT switch the meter to per-business-read, despite the 6.1× spread, because:

- it hands the customer the "paying for junk" pain the product was positioned against;
- Exa already charges nothing for non-matches, so per-read pricing loses that comparison;
- "340 businesses for $29" reads badly next to Scrap.io's 10,000 exports for $35;
- the free count promises "about 140 matches", so the match must stay the unit.

### Bands (set from the free count's 25-business sample)

| Sample match rate | Credits per match | Effective cost per credit (worst measured niche) |
|---|---|---|
| >= 15% | 1 | $0.029 (dental, 26.0%) |
| 6% – 15% | 2 | $0.069 (med spa, 6.2%) |
| < 6% | 3 | $0.060 (HVAC, 5.0%) |

Spread falls from 6.1x to 2.4x; every niche lands under $0.07 per credit.

## 2. Measured inputs (2,464 businesses, 3 runs, proof validity 100%)

| Market | Criteria | Businesses | Spend | Per read | Per match | Match rate |
|---|---|---|---|---|---|---|
| Dental, Phoenix | 1 | 1,000 | $7.63 | $0.0166 | $0.0294 | 26.0% |
| Med spa, Dallas | 2 | 779 | $6.60 | $0.0170 | $0.1374 | 6.2% |
| HVAC, Tampa | 2 | 685 | $6.08 | $0.0168 | $0.1787 | 5.0% |

Criteria multiply rather than add, so cost per match collapses as criteria are added.
This is arithmetic, not an engine defect. Criteria are capped at 3, with a warning on the third.

Excluded from the table: Google Places discovery top-up ($0.0079/business, HVAC coverage
31–48%), alert running costs (first-scan-only figures), and the ~40% unreadable sites.

## 3. Plans (margins stated WITHOUT breakage, at the worst measured niche)

| Plan | Price | Credits/mo | $/credit | Margin worst | Margin typical |
|---|---|---|---|---|---|
| Free | $0 | 20 | — | cost <= $3.70/user ¹ | — |
| Starter | $29 | 120 | $0.24 | 72% | 88% |
| Growth | $79 | 400 | $0.20 | 65% | 85% |
| Agency | $199 | 1,000 | $0.20 | 65% | 85% |
| Watch | $19 | 40 | $0.48 | 87% | 94% |
| Pack (no sub) | $19 | 100 | $0.19 | 63% | 85% |

Annual = two months free. Beyond credits: Starter adds 5 saved searches + Sheets; Growth
adds 25 saved searches + HubSpot/Instantly/Smartlead/webhook + templates; Agency adds
unlimited saved searches, 10 client workspaces, white-label exports, API + MCP; Watch is
alerts-only for maintenance mode.

Rules: rollover one month (capped at one month's allowance); no-website unlock at 0.25
credits; email verification passed through at cost; discovery top-up 1 credit per 10
Places-sourced businesses, shown on the confirm screen; a business unlocked once is free to
that workspace for 12 months; wrong matches refund automatically.

Allowances sit BELOW one market's match count on purpose (a metro niche holds ~300–500
matches; Starter's 120 is about a third).

## 4. Guardrails (implementation-relevant)

**Non-match privacy.** Non-matches and "couldn't tell" surface as counts + reasons only.
No names, no domains, no export. Exports contain matched rows only. No-website businesses
are a paid unlock at 0.25 credits, not a free leak.

**Scan budget.**

| Guardrail | Rule | Status |
|---|---|---|
| Scan budget | max **11** candidate reads per remaining credit | amended ² |
| Period read allowance | 11 reads per credit: Free 220 · Starter 1,320 · Growth 4,400 · Agency 11,000 · Watch 440 · Pack 1,100 | replaces the daily caps ² |
| Sample first | every run costs a 25-business sample before the full scan | as decided |
| No-hope stop | **<3%** matches in sample → full scan does not start | amended ² |
| Early abort | live match rate's 80% upper bound below **break-even for the quoted band and plan**, checked at 200 / 400 / 800 / 1,600 reads | amended ² |
| Band settlement | a completed scan bills the **cheaper** of the quoted band and the band its delivered rate earns | added ² |
| Criteria cap | 3 max, warn on the third | as decided |

¹ ² **Amendments of 2026-09-23, after the decision.** Every row marked here was
checked against revenue and changed; the rules as originally written permit a scan to
cost more than it bills. The reasoning is in `PROJECT_PLAN.md`'s Decision log (five
entries dated 2026-09-23), the arithmetic is in `src/lib/pricing.ts`, and 52 assertions
in `stage0/tests/test_pricing.mjs` fail if any of it stops holding. In short:

- **The 1% no-hope stop was below break-even** (a credit covers its own reading only
  above 2.3% on Starter, 2.9% on a Pack), **and raising it to 3% fixed almost nothing**,
  because the stop reads a 25-business sample whose only observable rates are multiples
  of 4%. Both lines sit between 0 and 1 matches. One match in 25 has a 95% interval of
  [0.7%, 19.5%], so a 0.7% search still started: −$28 on Starter over a full budget.
  No affordable sample can settle solvency, so the sample now only quotes a band.
- **Solvency moved to the live run.** The early abort is relative to break-even rather
  than to a fixed 1%, and uses a one-sided bound so it does not kill healthy runs on
  noise. **This caps the loss on any single scan at $3.36**, on any plan, with any
  criterion.
- **The daily read caps bounded nothing.** Credits deplete only on matches, so a
  criterion matching nothing never reduces a balance — Agency's 20,000 reads/day is
  $336 of reading a day against $199 a month. The period allowance of 11 reads per
  credit is derived from the most reading a legitimate run can need, and every paid
  plan now survives a period in which **nothing matches at all**: Starter $22.18 of
  reading against $29, Growth $73.92/$79, Agency $184.80/$199, Watch $7.39/$19,
  **Pack $18.48/$19**. Rounding the allowance to 12 instead of 11 sinks Pack.
- **The band quote is a ceiling.** Sampling error cuts both ways, and the other
  direction overcharges the customer: one match in 25 quotes band 3 on a search whose
  true rate may be 19%.
- ¹ **The free tier's cost is its reading, not its credits.** "≤ $1.40/user" prices the
  credits, and credits are spent only on matches — a free user whose searches match
  nothing spends none. The bounded figure is $3.70 per user per period.

**Free counts.** Sample 25 (not 60); cache by query for 7 days; 2/day anonymous per
device+IP then email signup; 20/day logged in; programmatic pages serve a stored count and
never scan per visitor.

**The pricing line, stated in full:** "You pay per match, at the rate shown before you
unlock, and each search carries a research budget based on your balance."

## 5. Subscription supply — where next month's matches come from

| Supply | What it is | Size | Confidence |
|---|---|---|---|
| Drip | allowance < market size | 120 credits vs ~300–500 matches = 3–4 months | certain |
| Unblocked | "couldn't tell" → judgeable as crawling improves | ~40% of sites today | within our control |
| Change flow | new businesses, status changes | low single digits/month (measure 30 Sep) | unknown |
| Expansion | next metro / niche / criteria set | unbounded | the real engine |

Product requirements that follow: monthly digest per saved search split into new / changed
/ newly-unblocked (counts free, names on unlock); market-depletion meter ("310 of ~400
unlocked here"); expansion suggestions with estimated counts; pause instead of cancel;
Watch tier at $19.

**Key metric: markets per user per quarter.** Target 60% of paying users running a second
market by day 60. One-and-done means packs are the honest product, not a subscription.

## 6. What must be true

| # | Must be true | Target | Measured by |
|---|---|---|---|
| 1 | Cost per read falls | <= $0.012 (from $0.0168) | cost meter, next benchmark run |
| 2 | Alerts gate on signals hash | re-judge only where signals move | change-rate run, 2026-09-30 |
| 3 | Free counts stay cheap | <= $0.45 per anonymous count ³ | sample 25 + cache |
| 4 | Buyers accept the band | no drop-off at confirm screen | 10 interviews, then funnel |
| 5 | Precision holds outside dental | >= 90% on med spa and HVAC | label those two niches |

³ Measured and holding: 25 reads × $0.0168 = **$0.42**. Note this prices one anonymous
count, not the free *plan* — see footnote ¹.

**Cost levers, in order:** tech detection before any model call (measure the share settled
with no model call — main lever); read only check-plan pages; prompt caching on the fixed
instruction block; batch API for alerts; warm-cache growth via niche saturation.

**Alert gating (decided).** Noise floor on 60 unchanged sites: raw HTML 31.7% changed,
visible text 6.7%, normalised text 5.0%, judged signals 0.0%. Alerts gate on the SIGNALS
HASH. Raw-byte alerting would re-judge a third of the book weekly for nothing.

**Falsifiers.** (a) Buyers pay > $0.18 per matched lead → plain pay-per-match clears cost
in the worst niche and bands become a bonus. (b) The band visibly kills trials at the
confirm screen → flat rate priced against the worst niche. (c) Markets per user stays at 1
→ packs, not subscription.

## 7. Decisions of record

1. Bill per matched business, banded 1x / 2x / 3x by sample match rate.
2. Plans: $0 / $29 / $79 / $199, plus Watch $19 and a $19 pack of 100.
3. Margins stated without breakage; the $0.04 cost-per-match gate is RETIRED.
4. Scan budget: ~~20 candidate reads per remaining credit, plus daily read caps~~ →
   **11 reads per credit, as a period allowance**, plus a break-even-relative live abort.
   Amended 2026-09-23; see §4.
5. Non-matches and "couldn't tell" are counts and reasons only, never exportable rows.
6. Criteria capped at 3.
7. Free counts: sample 25, cached 7 days, 2/day anonymous.
8. Alerts gate on the signals hash.
