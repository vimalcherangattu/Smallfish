# Data sourcing — the plan

Adopted by the owner 2026-10-24. Decision log entry of the same date in `PROJECT_PLAN.md`.
This file is the plan and its gates; `STATUS.md` says which step is in progress.

## Why this exists

On 2026-10-24 every search in production failed with `No parquet files for Overture
release 2026-08-19.0`. Overture keeps about two months of releases online and deleted the
one `supply.ts` had pinned. Both surviving releases (`2026-09-23.x`, `2026-10-21.0`) had
also **dropped the `categories` column** for `taxonomy` and renamed most ids
(`dentist` → `dental_clinic`), so moving the pin forward would have swapped one outage for
another. The search read a dataset we do not control, live, in the request.

The owner's ask that followed: make the sourcing foolproof, and get creative enough that
the data is something nobody else has.

## What "data nobody has" can honestly mean

Not the list. A list of Denver plumbers is a commodity — Google, ZoomInfo and Overture
each have one. What nobody has, together:

1. **An identity graph built from sources others do not join.** Licensing boards, state
   entity filings and new-domain feeds, resolved against map listings and websites, so a
   business is corroborated by independent records.
2. **Facts read off the business's own site** — owner, named contact, tools, gaps — with a
   quote and a date. Every read adds to it and it cannot be bought.
3. **Freshness.** A business that opened this week, seen in a license grant, an LLC filing
   or a new domain months before it reaches a map or a data broker.

The list is the input. The graph, the facts and the freshness are the product.

## Architecture rules

- **Snapshots, never live reads.** Every source lands in storage we own on its own
  schedule. The search reads only our copy. A source that vanishes, changes schema or
  rate-limits us stalls its own refresh; it never takes the search down.
- **A contract test on every adapter.** A new snapshot is promoted only if its schema has
  the expected columns, ~20 fixed canary searches stay within ±15% of the last snapshot,
  and the trade mapping still resolves. Fail → the old snapshot stays live and we are
  alerted. This is the test that would have caught 2026-10-24 before a customer did.
- **Entity resolution.** Website domain first, then phone, then name + distance. One
  internal id per business with every source id attached. Measured against a
  hand-labelled pair set before anything relies on it.
- **Provenance per field.** Source and date on every fact. Lets the row say how we know,
  and lets a bad source be pulled out cleanly.
- **Corroboration as the quality signal.** Three independent sources (listing + active
  licence + live site) means real and operating; one source means candidate. Ranked and
  labelled, the same honesty as "couldn't tell".
- **Freshness decays.** Contacts 90 days, site-alive 30 days, licence status on the
  board's own cycle. A stale fact is re-checked before it is sold, never re-sold.

## Sources, in tiers

| Tier | Source | Gives | Cost |
|---|---|---|---|
| 1 open places | Overture (monthly snapshot) | The base layer | Free |
| 1 | Foursquare OS Places | Second base layer | Free, needs `HF_TOKEN` |
| 1 | OpenStreetMap | Retail and food | Free |
| 2 government | State trade licence boards (TX TDLR, FL DBPR, CA CSLB first) | HVAC, plumbing, electrical, roofing — where Overture is 31% | Free bulk files |
| 2 | NPPES / NPI registry | Every billing healthcare provider: dental, med spa, chiro, therapy | Free, monthly |
| 2 | State professional boards | Vets, salons, spas, massage | Free, varies |
| 2 | Secretary of State new-entity filings | **Freshness**: LLCs formed this week | Free in several states |
| 2 | SBA PPP loan data | A federal headcount signal for "small" | Free, dated 2020–21 |
| 2 | City building permits | Contractors *active* this quarter | Free, open-data portals |
| 2 | Health inspections, liquor licences | Restaurants and bars, operating status | Free |
| 3 web | Common Crawl / Web Data Commons `LocalBusiness` markup | Businesses that have a site, by definition | Free |
| 3 | ICANN CZDS zone diffs, Certificate Transparency | **Freshness**: new domains, matched to new filings | Free, CZDS needs a form |
| 3 | Booking and site-builder platform directories | The business and a proven fact at once | Free; **terms checked per platform first** |
| 4 paid | Google Maps via Apify, Google Places | Gap-fill aimed by measured coverage, ids only, cached 30 days | $1.50 / 1,000 places |
| 5 ours | Every read, every "not a fit", every bounce | The facts and corrections nobody else has | Already paid for |

## How we know it works

The coverage method already exists — `stage0/src/coverage/google_baseline.py`, 240 cells
across four metros (`docs/stage0-coverage-report.md` §7a). Re-run it after every source.

- **Targets:** ≥ 85% overlap in every measured niche, ≥ 70% for HVAC (31.1% strict today).
- Coverage known per trade × metro. Below target, the free count says so, and the paid
  gap-fill is aimed there.
- Dashboard: entity-resolution precision, share corroborated by ≥ 2 sources, median fact
  age, and **businesses we listed before Google did** — the one number that proves the claim.

## Order of work

| # | Step | Gate to call it done |
|---|---|---|
| 0 | Restore search on the new Overture taxonomy; release check; honest error copy | Production count works for the canary set |
| 1 | Our own store + snapshot of Overture + adapter contract test + entity ids + provenance | Overture can delete a release and nothing breaks |
| 2 | Foursquare + OSM; re-measure | Coverage re-run published |
| 3 | NPI + TX/FL/CA trade boards; re-measure | HVAC ≥ 70% or the reason it is not |
| 4 | Reads and customer outcomes written back into the graph | A second read of a business starts from what the first learned |
| 5 | Freshness: entity filings × new domains | A "new this month" count with sources |
| 6 | Web extracts + platform directories that permit it | Per-platform terms note recorded |
| 7 | Paid gap-fill aimed by measured coverage | Spend inside the owner's monthly cap |

## Risks held in view

- **Terms, per source.** Government records are public; platforms and Google are contract
  risk the owner has chosen inside limits ("aim, never resell"). A short legal note per
  source is written before it is turned on.
- **Personal data.** Licence and NPI records name people and sometimes list home
  addresses. Keep the business-facing record; drop home addresses. Opt-out must reach
  every source, not one.
- **Entity-resolution errors** are the silent failure: two businesses merged, or one
  shown twice. That is why step 1 carries a measured pair set.

## Waiting on the owner

- `HF_TOKEN` (step 2), storage spend (step 1), a monthly cap for paid gap-fill (step 7).
- Which trades go deep first: HVAC/plumbing (boards) or dental/med spa (NPI).
