# Small Fish — working notes for Claude Code

## Founding documents (live, read via the Claude Docs connector)

- PMM research: https://claude.ai/code/artifact/acbd9367-fb11-46b3-b0dd-d3db0a184aae
- Product doc: https://claude.ai/code/artifact/1160c49b-0c15-43ac-84f7-adc6e7a479d6
- GTM plan: https://claude.ai/code/artifact/b1baa219-dba1-4fc4-b271-9c679056a1e6

Rules:
- Re-read a doc at session start if the task touches its area.
- Strategy lives in these docs; numbers and decisions live in PROJECT_PLAN.md.
  Where they disagree, the plan wins and gets a Decision log entry.
- Do not edit the docs. Leave a comment on the doc if something should change.

Read them with the Claude Docs connector, never WebFetch — the links are docs, and
fetching them returns nothing useful. Verify the connector with `/mcp`; authenticate from
that panel if it reports "needs authentication".

## Where things are

| Path | What it is |
|---|---|
| `PROJECT_PLAN.md` | Stages, hard gates, every task with a definition of done, live measurements, decision log. |
| `docs/PRICING.md` | **Authoritative for pricing**, and it supersedes the product document's pricing sections. Its §4 carries amendments of 2026-09-23 that reverse several guardrails as decided — read the footnotes, not just the rows. |
| `docs/README.md` | The founding documents and what each one owns. |
| `src/lib/pricing.ts` | The pricing decision as code: bands, plans, the scan budget, the live solvency abort, band settlement. `stage0/tests/test_pricing.mjs` fails if any of it stops holding. |
| `docs/design/home-page.html` | The composed home page in the design language (2026-09-22). **Its visual language is adoptable; its scores, tiers and weights are not — they are the unresolved divergence, made concrete.** See `docs/design-system.md` §6. |
| `docs/design-system.md` | **Read before building any customer-facing screen.** Principles, type, colour and component rules, distilled from `docs/design/small-fish-design-system-v1.pdf` (the visual authority — a 13 MB PDF cannot be grepped). Its §5 records an **unresolved** divergence: the design system describes scores, tiers and weighted rubrics, the repo implements binary verdicts, and it cites an "Account Finder PRD v3" that is not among the founding documents. Do not resolve that by picking one silently. |
| `docs/critique.md` | Review of the founding documents and the reasoning behind the plan's departures from them. |
| `docs/stage0-coverage-report.md` | Measured results: candidate supply, website readability, technology signals, location shapes. **§7 answers gate item 1 (S0-06), and the answer is no** — read it before planning Stage 0 work. |
| `docs/icp-discovery.md` | Design for the ICP flow. S1-23 – S1-26 are built (`src/lib/icp.ts`); S1-22, reading the seller's own site, is blocked on a model key and the flow runs on a typed offer instead. |
| `stage0/src/coverage/` | Candidate extraction and the site probe. |
| `stage0/src/engine/` | Technology detection, check plans, geometry. |
| `stage0/tests/` | `python3 stage0/tests/run_all.py` |
| `src/` | The Next.js app: map region picker, criteria, results with proof, ICP builder. |
| `src/lib/worker.ts` | One slice of a queued read. A tick claims the oldest job with work left, reads what fits in ~45s, writes it, hands the job back. `/api/worker` runs it behind `CRON_SECRET`; `vercel.json` ticks it **once a day** — Hobby caps crons at daily and a faster expression *fails the build*, which froze production for three days (2026-09-30 → 10-03). At one tick a day the hand path is the only one that finishes a read. Its first source of work is the 6,814 already-extracted sites nobody has read. |
| `src/lib/mail.ts` | The four customer emails as **pure functions**, plus the one `sendMail`. Needs `RESEND_API_KEY`; without it every message records why it did not send. |
| `src/lib/unlock.ts` | **What a credit buys.** `matchedIn` is the single ordering every surface uses — the screen, the CSV, the CRM push and the unlock — because the rows on the invoice have to be the rows on the screen. `visibleIds` decides what a visitor sees for nothing (the first `FREE_PREVIEW` = 3). Pure, so `stage0/tests/test_unlock.mjs` can hold it. |
| `src/lib/charging.ts` | The one loop that spends credits, server-side. Every surface that hands over a name calls it; the CRM push did not, and that was invisible until the gate went on. |
| `src/lib/signals.ts` | **One catalogue of observable signals**, read by outreach and ICP alike. `provable: false` entries are deliberate — they are how the ICP flow refuses a criterion out loud instead of proposing one the engine cannot settle. |
| `src/lib/outreach.ts` | Pain point, icebreaker and note, derived from evidence only. Refuses by default; `withheld` says why. |
| `src/lib/icp.ts` | Offer → observable gaps → candidate ICPs with live counts (S1-23 – S1-26). |
| `src/lib/templates.ts` | The templates library (S2-01), **derived from `signals.ts`, never a second list**. Publishes what is proven, names what is runnable-but-unmeasured, and refuses the rest out loud. Presence counts are the complement of absence criteria that were run, and every such row is marked. |
| `stage0/src/benchmark/export_benchmark.py` | Generates `public/data/benchmark.json` from the Live numbers table in `PROJECT_PLAN.md`. `/benchmark` renders it and **carries no number of its own** — that is what makes "kept current" (S2-04) mechanical rather than a promise. Re-run it after editing a measurement, or `test_benchmark_export.py` fails. |
| `public/data/` | Measured data the app serves, generated by `stage0/src/coverage/export_app_data.py`. Regenerate after any new probe run. `index.json` carries each market's criteria and tallies so the ICP counts cost 4 KB, not four megabytes. |

## Two streams

From 2026-10-04 the work runs in two sessions that do not share context: **GTM**
(home page, landing pages, the doors) and **Product** (the app, the engine, the
API). **Read `docs/STREAMS.md` before you change anything** — it says who owns
what, which handful of files are neither's, and the branch protocol.

`stage0/tests/test_contract.mjs` is what keeps the two halves from contradicting
each other: it reads the prerendered marketing HTML and checks it against the
code Product owns. If you change `pricing.ts`, `signals.ts` or `public/data`,
run it and fix what it names. Do not change the test to match the copy — it is
pointing at a promise.

To start a session: `docs/brief-product.md` or `docs/brief-gtm.md`.

## How this project works

Stage 0 exists to answer four questions with measurements, not estimates, before any
product is built. The gate is in `PROJECT_PLAN.md` and it is hard: a stage starts because
its gate passed, not because the calendar moved.

When you measure something that contradicts a document, a critique or an earlier
measurement, **say so explicitly and record the retraction** — `docs/critique.md` and the
decision log both carry reversals already. A plan that only accumulates confirmations is
not being tested.

## Engineering rules specific to this codebase

- **Two layers, and the general one is not optional.** Technology detection
  (`engine/tech_signals.py`) is a cheap optimisation over model judgment, never a
  precondition. Any criterion in any vertical must produce a usable check plan without a
  catalogue — `engine/check_plan.py`, validated on a vertical with no catalogue at all.
  Building on detection alone turns Small Fish into a booking-widget detector.
- **Absence needs positive proof.** A "no X" verdict requires that the X-relevant pages
  were read and no signal was found. Missing evidence is "couldn't tell", never "no".
  `settleable_without_model` is false for every absence criterion by design.
- **Crawl politely and identify honestly.** robots.txt, per-domain throttling, a real
  user agent. This was tested against the alternative: presenting as a browser recovers
  one readable site in 78, so the principle costs almost nothing.
- **Never blame the environment on the business.** Our own proxy and network failures are
  excluded from every measured rate, not counted as unreadable sites.
- **Detection errs toward firing.** A false positive costs a missed match; a false
  negative costs a false match. Only the second is expensive.
- **Measure before trusting a number.** Four probe bugs were found and fixed before any
  readability figure was believed. Check what a result is actually measuring — an early
  "0% of booking links are hidden" was an artifact of guessed URLs 404ing.

## Data sources

- **Candidates:** Overture Places, read over HTTPS with DuckDB. No download, no AWS
  credentials, `bbox` gives row-group pruning. Boundaries for city/county/state come from
  Overture Divisions in the same release.
- **Google Places:** gap-fill only, storing place IDs only, as Google's terms require.
- **Never scrape Google Maps.** It breaks Google's terms; `hiQ v. LinkedIn` concerns
  computer-crime law, not contract terms, and does not make it safe.
- **Store extracted facts, not page copies.**

## Environment

```bash
pip install duckdb "httpx[http2]"
```

### How the API keys actually arrive — measured 2026-09-19

**Retraction.** This section previously stated that both keys arrive as egress credentials,
that neither appears in `env`, and that a `401` from the curl below means "this session
predates the credential". Two of those three are wrong, and the third is untestable as
written. Measured results, all reproducible with `preflight.py`:

| Claim (previous) | Measured |
|---|---|
| No `GOOGLE_PLACES_API_KEY` in the environment | **There is one** — a valid `AIza…` key, set as a plain environment variable |
| The proxy attaches the Anthropic key at egress | **It does not.** `api.anthropic.com` is on the proxy's `noProxy` list, so the request never reaches the proxy |
| `401` means the session predates the credential | **Unfalsifiable.** That probe returns 401 whether or not a credential exists |

The mechanism: `curl -sS "$HTTPS_PROXY/__agentproxy/status"` shows `api.anthropic.com` in
`noProxy`. Traffic to it goes direct, so no credential can be injected on that path —
in this environment an egress credential for Anthropic may not be attachable at all.

**The SDK-vs-proxy question is answered: neither path works without a real key.** Tested
four ways, all 401:

- no auth header, direct → `x-api-key header is required`
- no auth header, forced through the proxy → `x-api-key header is required`
- `x-api-key: placeholder`, direct and via proxy → `invalid x-api-key`
- `anthropic.Anthropic(api_key="placeholder")` → `AuthenticationError`

`invalid x-api-key` is the informative one: the placeholder **reached Anthropic
unmodified**, which proves the proxy is not rewriting the header either. So `engine/llm.py`
can keep the ordinary SDK path; it needs `ANTHROPIC_API_KEY` in the environment, which is
currently the only mechanism observed to work here.

The environment-variables box is still labelled as visible to anyone using the environment.
That is a real trade-off, not a reason to disbelieve the measurement — the Places key is
sitting in it today.

Credential shapes, if egress credentials are attempted again — note the **empty prefix** on
both; `Authorization` + `Bearer` is the wrong shape and fails validation:

| API | Allowed website | Header | Prefix |
|---|---|---|---|
| Anthropic | `api.anthropic.com` | `x-api-key` | *(empty)* |
| Google Places | `places.googleapis.com` | `X-Goog-Api-Key` | *(empty)* |

### Verify before running anything that spends money

Do not hand-roll the curl — it was wrong for a session. Run:

```bash
python3 stage0/src/engine/preflight.py
```

It exits 0 only when the benchmark could actually produce numbers, and separates the cases
that have different fixes: no credential anywhere, a credential attached at egress, a key
in the environment, a key that is valid but restricted, and an API that is not enabled on
the project. It also reports which pipeline components exist, because working keys are only
half of what `S0-17` needs.

Use `places:searchNearby` rather than `places:searchText` when diagnosing Google by hand:
`searchText` returns a generic `API_KEY_SERVICE_BLOCKED`, while `searchNearby` returns
`SERVICE_DISABLED` and names the project and the API to enable.

## The app

```bash
npm install && npm run build && npx next start
python3 stage0/src/coverage/export_app_data.py   # regenerate public/data
```

Next.js at the repo root so Vercel auto-detects it. No API keys: the basemap is
MapLibre + OpenStreetMap raster tiles, and all data is static JSON.

Two traps worth not rediscovering, both cost real time:

- **Pin MapLibre to v5.** v6 is ESM-only with a separate worker module that does not
  survive Next's bundling. The failure is silent and misleading: layers register, no
  errors fire, raster tiles paint normally, but every GeoJSON source never finishes
  loading, so `isStyleLoaded()` stays false forever and nothing you add renders.
- **Do not position the map container with `absolute inset-0`.** MapLibre's stylesheet
  sets `.maplibregl-map { position: relative }`, which beats the utility class and
  leaves `inset-0` inert — the container then collapses to zero height. Size it
  explicitly (`h-full w-full`) and keep a `ResizeObserver` calling `map.resize()`,
  because MapLibre measures its container once at construction.

## Git

**Everything goes to `main`, and `main` is production.** Every push deploys to
getsmallfish.com in about two minutes. That is the decision while the product is being
built: speed over staging, because the loop that catches mistakes is fast and the
alternative is work sitting in a branch nobody can see. A branch push builds a preview,
but it is behind Vercel Authentication — the owner can open it, a session cannot — so
holding work there means nobody checks it rather than someone does.

The condition is **no conflicts**, and with two sessions on one branch that takes care:

- **Before every push**: `git pull --rebase origin main`, then run
  `python3 stage0/tests/run_all.py` — **after** the rebase, because that run is the only
  thing that knows whether the other stream broke you. Then push.
- **A rebase conflict is a stop, not a puzzle.** You cannot see the other session's
  intent. Say what conflicted and leave it rather than guessing at their work.
- **Push small and often.** A long-lived pile of commits is what turns a rebase into a
  conflict. Two sessions can share `main` indefinitely if neither sits on work.
- **Whoever pushes checks production afterwards.** Fetch the URL. A green build has
  hidden a live defect twice in one day: `/account` answered a signed-out visitor with
  404, and the credit pill rendered milli-credits as credits. Both suites were green.

Git conflicts are not the only kind. `stage0/tests/test_contract.mjs` catches the
semantic ones — GTM copy disagreeing with Product's numbers — which git cannot see.

**Say so in chat before pushing a change that moves the commercial offer** (a price, the
free allowance, a plan size) or replaces a screen wholesale. Not a gate, just a heads-up
before it is live to everyone.

Branches: `claude/gtm-<something>` and `claude/product-<something>` exist if a stream
wants one for a spike. They are not the default. See `docs/STREAMS.md`.

## Next up

**Retraction.** This section previously reported **8 blockers as of 2026-09-19** — two
credentials and six unbuilt components — and listed enabling Places API (New) on Google
project `74590284143` as a thing to go and do. Measured 2026-10-01 with
`python3 stage0/src/engine/preflight.py`: **1 blocker.** Google Places passes; the API was
enabled at some point after that note was written, so it was sending the next person to a
console page that was already correct. All six "unbuilt" components exist and preflight
reports them present. Re-run preflight rather than trusting this paragraph.

```
[FAIL] Anthropic: no credential by any path
[PASS] Google Places: reachable via GOOGLE_PLACES_API_KEY
[PASS] S0-08 fetcher · S0-11+12+14 judge · S0-13 absence rule · S0-15 cost meter
[PASS] S0-17 harness · S0-29 geometry · S0-32 check plans
[PASS] S0-16 hand-labelled set: 142 labels across 2 markets — THIN
```

### The one credential blocker

- **Anthropic:** no key by any path. Needs `ANTHROPIC_API_KEY` set as an environment
  variable (the egress-credential route does not reach `api.anthropic.com` — see above).

### Where the gate actually stands

**Gate item 1 is answered and it does not pass as written** — `docs/stage0-coverage-report.md`
§7, written 2026-10-01. Open-data overlap clears 70% for veterinary alone; HVAC is
31–48%. The escape clause (a costed gap-fill under $0.04 per match) clears dental and
HVAC on a cold read and fails med spa at $0.059. All three clear it warm, so it is a
cold-market failure with a price on it. **Whether to proceed anyway is a decision for the
owner, not something to resolve in code.**

The sharpest finding there points the work somewhere the gate's own wording does not: med
spa's gap-fill is $0.0200 per match and its *reading* is $0.0394, so coverage is not what
breaks it. **Match rate and read cost are the levers.**

### What is genuinely next

1. **S0-16 — hand-labelling.** 142 labels across 2 markets, which preflight calls THIN.
   Gate item 2 (precision) cannot be measured until this is 3 × 100. Human work; it
   cannot be automated away, and recall is unmeasurable without the full true-match set.
2. **S0-03 — Foursquare merge.** Blocked on a free `HF_TOKEN`. The cheapest remaining
   lever on the overlap half of gate item 1, and it can only raise coverage.
3. **Re-run the benchmark** once `ANTHROPIC_API_KEY` exists, to widen S0-17 past the
   three markets it has metered.

Everything else before that point is done and measured; see the Live numbers table in
`PROJECT_PLAN.md` and `docs/stage0-coverage-report.md`.
