"""Model access and cost accounting (task S0-15).

Model choice follows the product document, which specifies "a small model (Claude
Haiku 4.5 class)" for judging, Haiku 4.5 pricing for profile extraction, and "a
stronger model re-checks only the borderline cases and a random audit sample".

Cost is metered on every call rather than estimated, because the whole Stage 0 gate
turns on a measured cost per match and the plan's figures are currently assumptions.
Cache reads and writes are priced separately — prompt caching is the largest single
lever in the cost model and it only shows up if you account for it.

Nothing here is called without `ANTHROPIC_API_KEY` in the environment.
"""

from __future__ import annotations

import json
import os
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "stage0" / "data"

# Work model: extraction and first-pass judging.
MODEL_WORKER = os.environ.get("SMALLFISH_MODEL_WORKER", "claude-sonnet-5")
# Measured, not assumed. The product document specified "a small model (Claude
# Haiku 4.5 class)" for judging. On 70 hand labels over a frozen corpus that
# choice delivered 6.7% recall; Sonnet 5 delivered 33.3% on the same pages and
# the same prompt, at better precision (83% vs 50%) AND a lower cost per match
# ($0.032 vs $0.037) — the stronger model raises the match rate faster than it
# raises the bill. Opus 5 went further on recall (40%) but lost precision (75%)
# and blew the budget at $0.062 per match. Sonnet 5 is the measured optimum.
# Audit model: borderline cases and the random re-judge sample.
MODEL_AUDIT = os.environ.get("SMALLFISH_MODEL_AUDIT", "claude-opus-5")

# USD per million tokens. Cache reads are ~0.1x input, cache writes ~1.25x.
PRICING: dict[str, dict[str, float]] = {
    "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
    "claude-sonnet-5": {"input": 2.00, "output": 10.00},
    "claude-opus-5": {"input": 5.00, "output": 25.00},
}
CACHE_READ_MULTIPLIER = 0.1
CACHE_WRITE_MULTIPLIER = 1.25


class MissingApiKey(RuntimeError):
    """Raised instead of failing deep inside a run."""


def require_api_key() -> str:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise MissingApiKey(
            "ANTHROPIC_API_KEY is not set. Profile extraction and criteria judgment "
            "need it; coverage and readability measurement do not."
        )
    return key


def client():
    """The Anthropic client, imported lazily so the coverage scripts stay dependency-free."""
    require_api_key()
    import anthropic

    return anthropic.Anthropic(max_retries=4)


def price_usage(model: str, usage) -> float:
    """Cost of one call in USD, counting cached tokens at their own rates."""
    rates = PRICING.get(model)
    if rates is None:
        return 0.0

    plain_in = getattr(usage, "input_tokens", 0) or 0
    out = getattr(usage, "output_tokens", 0) or 0
    cache_read = getattr(usage, "cache_read_input_tokens", 0) or 0
    cache_write = getattr(usage, "cache_creation_input_tokens", 0) or 0

    return (
        plain_in * rates["input"]
        + cache_read * rates["input"] * CACHE_READ_MULTIPLIER
        + cache_write * rates["input"] * CACHE_WRITE_MULTIPLIER
        + out * rates["output"]
    ) / 1_000_000


@dataclass
class Call:
    """One model call, as it will be reported in the cost table."""

    stage: str  # "profile" | "judge" | "audit"
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cost_usd: float = 0.0
    seconds: float = 0.0
    business_id: str | None = None


@dataclass
class CostMeter:
    """Accumulates every call so cost per business and per match come out measured.

    Thread-safe: the pipeline judges businesses concurrently.
    """

    calls: list[Call] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def record(
        self, stage: str, model: str, usage, seconds: float, business_id: str | None = None
    ) -> Call:
        call = Call(
            stage=stage,
            model=model,
            input_tokens=getattr(usage, "input_tokens", 0) or 0,
            output_tokens=getattr(usage, "output_tokens", 0) or 0,
            cache_read_tokens=getattr(usage, "cache_read_input_tokens", 0) or 0,
            cache_write_tokens=getattr(usage, "cache_creation_input_tokens", 0) or 0,
            cost_usd=price_usage(model, usage),
            seconds=round(seconds, 2),
            business_id=business_id,
        )
        with self._lock:
            self.calls.append(call)
        return call

    @property
    def total_usd(self) -> float:
        return sum(c.cost_usd for c in self.calls)

    def by_stage(self) -> dict[str, dict]:
        out: dict[str, dict] = defaultdict(
            lambda: {"calls": 0, "cost_usd": 0.0, "input": 0, "output": 0, "cache_read": 0}
        )
        for call in self.calls:
            row = out[call.stage]
            row["calls"] += 1
            row["cost_usd"] += call.cost_usd
            row["input"] += call.input_tokens
            row["output"] += call.output_tokens
            row["cache_read"] += call.cache_read_tokens
        for row in out.values():
            row["cost_usd"] = round(row["cost_usd"], 6)
        return dict(out)

    def summary(self, businesses: int, matches: int) -> dict:
        """The numbers the Stage 0 gate actually turns on."""
        cache_read = sum(c.cache_read_tokens for c in self.calls)
        billed_in = sum(c.input_tokens for c in self.calls) + cache_read
        return {
            "model_calls": len(self.calls),
            "businesses_judged": businesses,
            "matches": matches,
            "total_usd": round(self.total_usd, 4),
            "cost_per_business": round(self.total_usd / businesses, 5) if businesses else 0.0,
            "cost_per_match": round(self.total_usd / matches, 5) if matches else None,
            "cache_read_share": round(cache_read / billed_in, 3) if billed_in else 0.0,
            "by_stage": self.by_stage(),
        }

    def write(self, path: Path | None = None) -> Path:
        path = path or DATA / "cost-log.jsonl"
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w") as fh:
            for call in self.calls:
                fh.write(json.dumps(call.__dict__) + "\n")
        return path


class timed:
    """`with timed() as t:` … `t.seconds`."""

    def __enter__(self) -> "timed":
        self._start = time.monotonic()
        self.seconds = 0.0
        return self

    def __exit__(self, *exc) -> None:
        self.seconds = time.monotonic() - self._start
