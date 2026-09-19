# Critique of the Small Fish plan

Review of the three founding documents (linked from `CLAUDE.md`) **as they stood on
2026-09-19**. Ranked by expected damage, not by document order. Each finding names the fix
that is folded into `PROJECT_PLAN.md`.

The documents are live and may have moved on since. The versions reviewed here are the
PDF snapshots in git history at commit `79fe6cb`.

**Finding 3 has since been measured and downgraded** — see §4 and §5a of
`docs/stage0-coverage-report.md`. The related claim that bot-blocking was the most
addressable part of the readability floor was also tested and retracted (§2a).

## 1. The alert engine is an unpriced, unbounded liability

**Where.** Product document, *The engine → Freshness* and *Pricing*; GTM, automation C1.

Saved searches are the stated retention engine (target: 60% of paid users hold an active
saved search, weekly re-runs) and alerts are free to the user. Every weekly re-run
re-checks the entire candidate set of that search, not just the matches. A Growth user
with 25 saved searches over ~600 candidates each re-checks ~15,000 businesses a week.

Even granting the cheap change-check (page hash, headers), a 5% weekly change rate means
~750 full re-reads a week:

```
750 × $0.008 ≈ $6/week ≈ $312/year
```

against $948/year of Growth revenue — and that is *before* any match costs. The cost model
in *The engine → Cost control* prices search-time reads only. Alerts appear nowhere in it.

**Fix.** Price alerts explicitly. Cap saved searches by candidate volume, not by count
(e.g. a monthly re-check budget per plan). Measure the real weekly change rate in Stage 0
so the cap is set from data — it is one of the cheapest numbers to obtain and it decides
whether the retention engine is affordable.

## 2. Retention and breakage are in direct conflict

**Where.** Product document, *Pricing → Unit economics*.

The typical case (15% match rate) yields 49% gross margin at the Growth price, below the
stated 70% target. The gap is closed with "at 30% unused, the typical-case margin rises to
about 65%."

But every mechanic in the GTM plan exists to drive usage up: alerts, monthly recaps,
win-backs, save-search nudges. Succeeding at retention consumes the allowance and
collapses breakage exactly when the margin depends on it. Breakage is also the first thing
to vanish under the "credit rollover" mechanic already promised.

**Fix.** State gross margin without breakage and treat breakage as upside. If the
no-breakage typical case cannot clear ~60%, the Growth allowance is too generous or the
price is too low — decide that before acquisition spend, not after.

## 3. The flagship demo is the worst case for the flagship metric

**Where.** Every hero example across all three documents ("no online booking", "no quote
form", "no service-area pages").

The product document is correct that absence criteria require positive proof of absence.
That is the hardest verdict to reach from a 4-page crawl: a booking link on an unfetched
location sub-page, a widget injected by a script the plain fetch never runs, a "Schedule"
button rendered inside an iframe — each produces a **false match**, which is precisely the
failure mode that destroys trust and triggers refunds.

Meanwhile the safety valve ("if those pages couldn't be read, the verdict is couldn't
tell") pushes straight into the ≤25% couldn't-tell budget. Absence criteria are squeezed
between two targets at once.

**Fix.** The benchmark must over-weight absence criteria rather than sampling them evenly,
and precision must be reported *per criterion type*. A blended 90% that hides 78% on
absence is a false pass on the only searches the marketing leads with.

## 4. Coverage can kill this faster and cheaper than precision — so test it first

**Where.** Roadmap Stage 0 runs the precision benchmark first; coverage is an open
question.

PMM Foundations already cites OSM at 26% coverage in one test market and states plainly
that Overture and Foursquare coverage "must be measured per niche before launch." If open
data reaches only ~60% of Google's count in a target niche, Places stops being gap-fill and
becomes the primary candidate source at $32–35 per 1,000 Text Search results, with place
IDs the only storable field.

Rough effect at 40% gap-fill:

| | Plan assumption | At 40% gap-fill |
|---|---|---|
| Candidate cost / business | ~$0.002 | ~$0.014 |
| Cold cost / business | ~$0.010 | ~$0.024 |
| Blended cost / match @ 15% | $0.040 | ~$0.096 |

That breaches the stated $0.05 kill threshold on its own, with no model-cost overrun
required.

**Fix.** Invert Stage 0. Coverage is a days-not-weeks test, costs almost nothing, needs no
model spend, and can invalidate the plan before a single prompt is written. Run it first.

## 5. Programmatic SEO and cost control are in direct conflict

**Where.** GTM, channel 2 and automations A5/A6; product document, *Cost control*.

The cost model leans on the shared knowledge base making repeat searches warm. But
programmatic SEO deliberately generates *distinct* long-tail queries — niche × city × gap
— so by construction these reads are cold and the 7-day query cache never hits them.

At 3,000 pages refreshed monthly on a 60-business sample:

```
3,000 × 60 = 180,000 cold reads/month ≈ $1,800/month
```

against a budget line of `$300–600` for all model costs including free counts and dogfood
lists. The GTM budget is off by roughly 3–5× at the day-90 page target.

Free counts compound it: 5 anonymous per day per IP, each sampling up to 60 cold
businesses at ~$0.60 a count, is a live cost-attack surface.

**Fix.** Page counts should be computed from the knowledge base on a schedule that
saturates a *few* metros and niches deeply, rather than spraying 3,000 thin long-tail
pages. Re-budget model spend at the real page target, and gate anonymous counts harder
than 5/day before the SEO engine is switched on.

## 6. The day-90 MRR target does not reconcile with the plan's own pricing

**Where.** GTM, *90-day targets*; product document, *Revenue model at 700 paying users*.

100 paying users at $7,000 MRR implies $70 ARPU, which is essentially the mature mix
(50/35/15) including roughly 15 Agency customers at $199. The beachhead is solo
AI-automation-agency founders whom the research puts at $29–99/month, and the Agency plan
is not built until weeks 9–12.

A realistic early mix is Starter-heavy: $35–45 ARPU → **~$4.0–4.5K MRR at 100 users**.

**Fix.** Either raise the user target to ~170 or restate day-90 MRR at $4–4.5K. Carrying a
target that the pricing cannot produce will read as failure at the exact moment the plan
is otherwise working.

## 7. 35% of paid users from cold email is concentration risk on the most fragile channel

**Where.** GTM, channel 1.

The arithmetic is sound but the input is optimistic: 3% *positive* reply rate, sending to
agencies — the most email-fatigued segment there is, many of whom sell cold email
themselves and will judge list quality by the email that arrives. Published B2B norms sit
nearer 1–2%.

At 1.5%, the channel yields ~17 paying users instead of 34, and the day-90 target misses
on that channel alone. It is also the channel most exposed to the deliverability collapse
the GTM risk table already names.

**Fix.** Rebalance toward communities and creators (currently 25%), treat cold email as
upside, and set the day-90 plan so it survives a 1.5% reply rate.

## 8. There is no latency story, and latency is where the PLG funnel breaks

**Where.** Product document, *The experience* ("under three minutes", count "within
seconds").

Reading 60 cold sites — fetch, sometimes render, one model pass each — inside seconds
requires heavy parallelism and a warm cache that does not exist on day one. PMM
Foundations notes Exa's comparable runs can take up to an hour. At launch, *every* market
is cold, so the slow path is the default path, and it lands precisely on the
first-impression moment the whole funnel rests on.

**Fix.** Design the cold-market UX explicitly: stream partial counts, commit to a
first-three-matches-fast path, and offer "we're reading this market, get an email in 10
minutes" as a real, unembarrassed state. Add p50/p95 time-to-first-match to the metric set.

## 9. Precision is protected; perceived recall is not

**Where.** Product document, *Quality system → Targets*.

"Couldn't tell ≤25%" plus "false no ≤15%" permits up to ~40% of true matches to never
appear. The reasoning ("a missed match costs the user nothing") is wrong in the demo. A
user evaluating a 40-business niche they know personally will notice three missing clinics
they can name, and no precision figure recovers that call.

**Fix.** Add a **known-match recall** check to the benchmark: for each benchmark search,
hand-label the full set and report how many true matches were shown. Track it as a
launch-blocking metric alongside precision.

## 10. Three documents give the API three different dates

- Roadmap: API and MCP at Stage 3, months 6–18.
- Pricing table: API and MCP included in Agency, which ships weeks 9–12.
- GTM channel 4: n8n and Make templates "call the Small Fish API" at weeks 5–8.

**Fix.** Pick one. The GTM automations force the earliest date, so either an internal API
ships by week 5 or channel 4 moves.

## 11. The referral program answers the open question about list farmers

**Where.** Product document, open question "Is 25 free matches the right activation hook,
or does it attract list farmers?"; GTM, *Referral and virality*.

A 25/month free plan, plus "give 100, get 100" with no card requirement and no export cap,
is a free-match printing press. The open question is already answered by the mechanic
sitting two documents away.

**Fix.** Require the referrer to have a card on file, cap lifetime free matches per
identity rather than per month, and pay the referral bonus on the referred user's *first
paid* event, not their first export.

## 12. 22 automations before 50 customers is premature operational load

**Where.** GTM, *GTM automations*.

A7 (comparison page watcher), A9 (teardown drafter), C2 (monthly recap) and D1 (review
ask) produce near-zero value at 15 paying users, and "3 hours a week" to review 22 live n8n
workflows hitting production APIs is optimistic. Each is also a way to contact a prospect
badly while unattended.

**Fix.** Ship six: A1–A4 (dogfood loop), A5 (page generation), B2 (stuck-at-count nudge),
C1 (alerts). Everything else after 100 paying users.

## 13. The knowledge base is the only durable moat and it gets one paragraph

**Where.** Product document, *Vision → The arc*; PMM Foundations, *Threat* table.

Against Exa, pay-per-match is not a differentiator — Exa already charges nothing for
non-matches. Against Scrap.io, "evidence UX" is copyable in a quarter. What is not copyable
is a local-native knowledge base that is deeply saturated in specific niches and metros,
because that is what makes warm reads cheap and results instant.

A knowledge base 5% warm across the whole US is worth far less than one 90% warm across
five niches in ten metros — and the second is also the only version that makes the
latency story in finding 8 work.

**Fix.** Make saturation sequencing explicit strategy: name the niches and metros, saturate
them before widening, and let the GTM segment order follow the knowledge base rather than
the other way round.

## Smaller notes

- **North star is inconsistent with pricing.** 25,000 proven matches exported per week at
  ~300 paying users by month 6 implies ~83 matches per user per week (~360/month), which
  exceeds the entire Starter allowance and most of Growth. The target is 3–5× the usage the
  plans sell.
- **Opt-out is promised more completely than it can be delivered.** Suppression within 7
  days cannot reach rows already exported to a user's CSV or HubSpot. Say so plainly rather
  than implying full removal.
- **"Couldn't tell" is never charged, but it is the most expensive verdict to produce** —
  it usually means pages were fetched and a model ran. Every percentage point of
  couldn't-tell is pure cost. That makes the ≤25% target a *margin* target as much as a
  quality one, and it should appear in the unit economics, not only in the quality section.

## What the critique does not dispute

The core thesis holds up well and the structural argument is the strongest part of the
work: Google's category rules forbid services and attributes as map fields, so relevance
can only come from the website, and incumbents built on map fields cannot easily add it.
Evidence-per-row, honest uncertainty and pay-per-match are a coherent, mutually
reinforcing position rather than three separate features. The decision to gate launch on a
published accuracy benchmark is the right instinct, and rare in plans at this stage.

The findings above are about sequencing, cost realism and target arithmetic — not about
whether the product is worth building.
