# Small Fish

Find local businesses by what they actually do, prove every match, and charge only for
matches.

A user types a place, a type of business and what they are looking for, in plain English —
*"med spas in Dallas that offer Botox and have no online booking."* Small Fish reads each
candidate business's own website and returns only the ones that match, each with the
sentence and page that prove it. Businesses it cannot judge are shown as "couldn't tell",
never guessed.

## Where things are

| Path | What it is |
|---|---|
| `PROJECT_PLAN.md` | **Start here.** Stages, gates, every task, live measurements. |
| `CLAUDE.md` | Working rules, and links to the founding documents. |
| `docs/critique.md` | Review of the founding documents; the reasoning behind the plan's departures from them. |
| `docs/stage0-coverage-report.md` | Measured results from Stage 0. |
| `docs/icp-discovery.md` | Design for the ICP discovery flow. Not built. |
| `stage0/` | Stage 0 "prove it" work: coverage measurement, the engine, the accuracy benchmark. |

The three founding documents — product, PMM foundations and GTM — are **live Claude Docs**,
not files in this repo. Their links are in `CLAUDE.md`. Strategy lives in the docs; numbers
and decisions live in `PROJECT_PLAN.md`, and where they disagree the plan wins and records
why.

## Current stage

**Stage 0 — Prove it.** Nothing is built for users yet. Stage 0 exists to answer four
questions with measurements rather than estimates:

1. Does open places data see enough of each niche, or does Google gap-fill break the unit
   economics?
2. Can the engine judge criteria at ≥ 90% precision — including on absence criteria like
   "no online booking", which is the hardest case and the one the marketing leads with?
3. How many true matches does it actually show (recall)?
4. What does a match really cost?

The gate to building the product is in `PROJECT_PLAN.md`. It is a hard gate.

## Stage 0 quickstart

Requires Python 3.11+.

```bash
pip install duckdb

# S0-02 — pull Overture Places candidates for the three benchmark markets.
# Reads the public parquet release over HTTPS; no download, no AWS credentials.
python3 stage0/src/coverage/overture_extract.py
```

Benchmark markets and criteria are defined in `stage0/fixtures/benchmarks.json`.
Outputs land in `stage0/data/`.

## Principles

Carried from the product document, and binding on the code:

1. **Relevance over volume.** A short list the user trusts beats a long list they must
   re-check.
2. **Show the proof.** Every match carries the sentence and page that justify it. If we
   can't show it, we don't claim it.
3. **"Couldn't tell" is an honest answer.** A forced guess looks identical to a real match
   and destroys trust.
4. **Never invent.** No guessed emails, no made-up facts, no contact the business did not
   publish.
5. **Charge for value, not effort.** Users pay for matches; scanning cost is ours to
   engineer down.
6. **Plain English in, useful list out.**
7. **Respect the businesses we read.** Public business information only, polite crawling,
   and a way for any business to opt out.
