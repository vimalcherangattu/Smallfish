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
| `docs/critique.md` | Review of the founding documents and the reasoning behind the plan's departures from them. |
| `docs/stage0-coverage-report.md` | Measured results: candidate supply, website readability, technology signals, location shapes. |
| `docs/icp-discovery.md` | Design for the ICP flow (S1-22 – S1-26). Not built. |
| `stage0/src/coverage/` | Candidate extraction and the site probe. |
| `stage0/src/engine/` | Technology detection, check plans, geometry. |
| `stage0/tests/` | `python3 stage0/tests/test_check_plan.py` |

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

Keys are read from the environment; nothing is committed:

| Variable | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` | Profile extraction and criteria judgment (S0-11, S0-12) — gates the whole accuracy benchmark |
| `GOOGLE_PLACES_API_KEY` | The coverage baseline (S0-04) — gates Stage 0 gate item 1 |

## Git

Work goes to `main`. `claude/eager-archimedes-qdetjj` is kept pointing at the same commit.
