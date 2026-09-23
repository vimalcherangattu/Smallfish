# Decision log entry — 2026-09-23

Source: pricing decision brief (measured, 2,464 businesses) + product/GTM review.
Full detail: docs/PRICING.md

| # | Decision | Rationale | Affects |
|---|---|---|---|
| 1 | Billing unit stays **per matched business**, banded 1x/2x/3x by sample match rate | Cost per match swings 6.1x across niches; bands cut it to 2.4x without breaking the "pay only for matches" promise | billing, confirm screen |
| 2 | Per-business-read meter **rejected** | Makes the customer pay for non-results; loses the Exa comparison; breaks the free-count demo | pricing page |
| 3 | `$0.04 cost-per-match` gate **retired**; replaced by band-specific costs | The old gate was derived from an assumed price, not a measured one | PROJECT_PLAN gates, S0-25 |
| 4 | Plans: Free 20 / Starter $29-120 / Growth $79-400 / Agency $199-1,000 / Watch $19-40 / Pack $19-100 | Margins 63–72% at the worst measured niche, stated without breakage | billing |
| 5 | Allowances deliberately below one market's match count | A metro niche holds ~300–500 matches; exhausting it in month 1 is churn in month 2 | plan design |
| 6 | Non-matches and "couldn't tell" surface as **counts + reasons only** | Prevents free harvesting of the candidate list via an impossible criterion | results table, export |
| 7 | No-website businesses are a **paid unlock at 0.25 credits** | Genuine web-agency use case; sell it rather than leak it | results table |
| 8 | Scan budget: 20 candidate reads per remaining credit + daily read caps per plan | Closes the "impossible criterion burns the scan budget" attack | run engine |
| 9 | Sample-first (25 businesses), no-hope stop <1%, early abort after 200 reads | Bounds worst-case cost per run | run engine |
| 10 | Criteria capped at 3, warning on the third | Match rates multiply; the 4th criterion is where economics break | search parser, UI |
| 11 | Free counts: sample 25, cache by query 7 days, 2/day anonymous | A 60-business count costs ~$1.00 per anonymous visitor at measured rates | S1-02, SEO pages |
| 12 | Programmatic pages serve a **stored** count, never a per-visitor scan | Removes the SEO cost blow-up identified in the critique | S1-14, A5 |
| 13 | Alerts gate on the **signals hash** | Noise floor: raw HTML 31.7% / visible text 6.7% / normalised 5.0% / signals 0.0% | S1-07, S0-23 |
| 14 | Add **market-depletion meter**, expansion suggestions, pause-instead-of-cancel, Watch tier | The subscription's real supply is drip + unblocked + expansion, not market change | S1-07, S2 |
| 15 | New metric: **markets per user per quarter**, target 60% on a second market by day 60 | Earliest honest signal of whether a subscription is the right shape | analytics, scorecard |

## Open, assigned

- 10 customer interviews — lead question: what do you pay per usable lead today, and what would you pay per proven match? (anchors: ~$2 freelance, $200–500 SDR agency)
- Weekly change rate — 2026-09-30
- Cost per read down to <= $0.012 — next benchmark run
- Precision on med spa and HVAC — needs labelling (S0-16)
