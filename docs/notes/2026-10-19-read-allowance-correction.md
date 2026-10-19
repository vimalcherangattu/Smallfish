# Note for the GTM stream — the read allowance was wrong in the docs

**2026-10-19 · from the Product stream · share this as-is**

## Short version: nothing for you to change on the site

The scan budget / period read allowance moved from **11 reads per credit to 3** on
2026-10-15, when pricing was re-derived to hold a 70% gross-margin floor. The code
changed that day. **`docs/PRICING.md` kept saying 11 for four days**, with concrete
per-plan figures derived from it.

I checked before writing this, and the number **appears in no customer-facing copy** —
not the home page, not `/pricing`, not the app. It is an internal guardrail that bounds
how much reading a balance pays for. So there is no marketing surface to correct, and
`test_contract.mjs` and `test_home_copy.mjs` both pass on the current build.

You only need this if you ever write about how much reading a plan includes.

## The current numbers, if you do

`READS_PER_CREDIT = 3`, derived rather than chosen:

```
floor( (1 − 0.70) × $0.19 cheapest credit / $0.0183 all-in per read ) = 3
```

| Plan | Credits | Reads included | Our cost if nothing matches | Price |
|---|---|---|---|---|
| Free | 20 | 60 | $1.10 | $0 |
| Starter | 120 | 360 | $6.59 | $29 |
| Growth | 400 | 1,200 | $21.96 | $79 |
| Agency | 1,000 | 3,000 | $54.90 | $199 |
| Watch | 40 | 120 | $2.20 | $19 |
| Pack of 100 | 100 | 300 | $5.49 | $19 |

One more read per credit breaches the floor on the cheapest plan, which is why it floors
rather than rounds.

**What has not changed:** prices, credits per plan, the free grant, the bands (1 / 4 / 5
credits by rarity), or the $3.36 cap on a single scan's loss. If any marketing copy
quotes those, it is still right.

## Why it is worth you knowing anyway

The failure mode is one this project has already had once. The 2026-10-04 decision log
entry records the home page promising 2.5× what the plans delivered — `/pricing` rendered
from `PLANS` and the home page's slab was hand-written markup, and they disagreed about
what $29 buys. `test_contract.mjs` exists because of it.

This was the same shape in a different place: the code and the authoritative document
disagreeing, with nothing checking. It is now mechanical — `test_pricing.mjs` reads
`docs/PRICING.md` and fails if either guardrail row, or any per-plan figure in it, stops
matching `pricing.ts`. Verified by breaking it on purpose first.

**If you ever put a read allowance in copy, derive it from `READS_PER_CREDIT`** the way
`/pricing` derives tiers from `PLANS`, rather than typing the number. A figure typed into
markup is the one that goes stale without anything noticing.

## Nothing is owed back

No action, no reply needed. Product owns `pricing.ts` and `docs/PRICING.md`; both are
corrected and pushed.
