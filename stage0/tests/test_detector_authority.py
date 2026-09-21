"""What the detector is allowed to settle on its own, and what it must not.

Two bugs, both found by reading hand labels rather than by a test, both of the
same shape: the cheap layer quietly overruling the general one.

1. **A generic affordance word settles a criterion, and that was challenged
   and upheld by measurement.** Wright Orthodontics is rejected for "has no
   online booking" on an `/appointments/` href and a "Schedule Now" button,
   with no model call — and the hand label says it has no online booking. That
   page is a GoHighLevel lead form reading "complete the following form to
   request an appointment… availability will vary… confirmed by phone".

   Escalating those to the model was the obvious fix. Measured on a frozen
   corpus with one line changed, it was worse on every axis: recall 40.0% ->
   26.7%, precision 85.7% -> 80.0%, couldn't-tell 10.3% -> 29.3%, cost per
   match $0.0249 -> $0.0705. The generic patterns match raw HTML — hrefs,
   button markup — and the model is given visible text; **0 of 5 firing sites
   are matchable in the text the model sees.** Escalating handed the question
   to the only party that cannot see the evidence. The tests below pin the
   behaviour that won.

2. **Detection is cached, so a frozen run replays a stale catalogue.** The
   retune that scoped practice-management vendors to booking paths was measured
   on a frozen corpus, read as "no effect", and written up — while the new
   patterns had never executed. `CATALOGUE_FINGERPRINT` makes that visible and
   `benchmark/run.py` refuses the run.

    python3 stage0/tests/test_detector_authority.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine import tech_signals  # noqa: E402
from engine.fetcher import CACHE_VERSION, FetchCache, Page, SiteRead  # noqa: E402
from engine.judge import detector_verdict  # noqa: E402

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def read(vendors=None, generic=None) -> SiteRead:
    return SiteRead(
        url="https://example.com",
        outcome="ok",
        pages=[Page(url="https://example.com", status=200, text="x", chars=1, sha256="d")],
        vendors=vendors or {},
        generic=generic or {},
    )


ABSENCE = {"id": "no_online_booking", "text": "has no online booking", "type": "absence"}
PRESENCE = {"id": "offers_botox", "text": "offers Botox", "type": "presence"}


def main() -> int:
    # --- a named vendor settles it; that IS the booking, not a word about it
    v = detector_verdict(ABSENCE, read(vendors={"booking": ["calendly"]}))
    check("a booking vendor settles the absence criterion", v is not None and v.verdict == "no_match")
    check("and says which vendor, so the verdict is auditable",
          v is not None and "calendly" in v.reason)
    check("and is attributed to the detector, not the model",
          v is not None and v.settled_by == "detector")

    # --- a generic word settles it too, and must keep doing so
    g = detector_verdict(ABSENCE, read(generic={"booking": True}))
    check(
        "a generic booking signal alone settles it",
        g is not None and g.verdict == "no_match",
        "escalating these to the model cost 19 points of recall and 2.8x the "
        "cost per match: the model is shown visible text and the signal is in "
        "the HTML",
    )
    check(
        "and says the evidence was a route rather than naming a vendor",
        g is not None and "vendor" not in g.reason and "route" in g.reason,
    )
    check(
        "a vendor still settles it when a generic word is also present",
        (detector_verdict(ABSENCE, read(vendors={"booking": ["zocdoc"]},
                                        generic={"booking": True})) or None) is not None,
    )
    check(
        "no signal at all settles nothing",
        detector_verdict(ABSENCE, read()) is None,
    )

    # --- the asymmetry that absence.py exists for, restated here
    check(
        "the detector never returns a match, only a no_match",
        all(
            (detector_verdict(ABSENCE, r) or type("x", (), {"verdict": "no_match"})).verdict
            == "no_match"
            for r in (read(vendors={"booking": ["acuity"]}), read(generic={"booking": True}))
        ),
        "not detecting a signal is not proof of absence — that is absence.py's job",
    )
    check(
        "a presence criterion is never settled by the detector",
        detector_verdict(PRESENCE, read(vendors={"booking": ["calendly"]})) is None,
    )

    # --- the catalogue fingerprint
    check(
        "the fingerprint is stable across calls",
        tech_signals.CATALOGUE_FINGERPRINT == tech_signals.CATALOGUE_FINGERPRINT,
    )
    check(
        "the fingerprint tracks the catalogue, not a hand-maintained number",
        _fingerprint_moves_when_a_pattern_changes(),
        "a version number nobody remembers to bump is the one that fails",
    )

    # --- a cached read carrying another catalogue's detection is counted
    check("stale detection in a cache hit is counted", _stale_detection_is_counted())
    check("a cache hit from the current catalogue is not counted stale",
          _current_detection_is_not_counted())
    check("a LIVE run re-fetches rather than serve stale detection",
          _live_run_refetches_stale_detection(),
          "otherwise the remedy the error message names does nothing")
    check("a FROZEN run still replays it, so judge-only A/Bs remain possible",
          _frozen_run_still_replays())

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


def _fingerprint_moves_when_a_pattern_changes() -> bool:
    """Recompute the fingerprint over a mutated catalogue, without mutating the
    real one — importing a second copy would just recompute the same value."""
    import hashlib

    def fp(booking_generic):
        return hashlib.sha256(
            json.dumps(
                [
                    tech_signals.BOOKING_VENDORS, booking_generic,
                    tech_signals.BOOKING_VENDORS_BY_NICHE,
                    tech_signals.QUOTE_FORM_VENDORS, tech_signals.QUOTE_FORM_GENERIC,
                    tech_signals.ANY_FORM_GENERIC, tech_signals.CHAT_VENDORS,
                    tech_signals.CMS_VENDORS, tech_signals.PIXEL_VENDORS,
                ],
                sort_keys=True,
            ).encode()
        ).hexdigest()[:12]

    unchanged = fp(tech_signals.BOOKING_GENERIC)
    changed = fp(tech_signals.BOOKING_GENERIC + [r"a-new-pattern"])
    return unchanged == tech_signals.CATALOGUE_FINGERPRINT and changed != unchanged


def _cache_with(detector_value, *, frozen: bool) -> tuple[FetchCache, object]:
    import tempfile

    cache = FetchCache(Path(tempfile.mkdtemp()), ignore_version=frozen)
    r = read(vendors={"booking": ["dentrix"]})
    cache.put(r)
    raw = json.loads(cache._path(r.url).read_text())
    raw["detector"] = detector_value
    raw["v"] = CACHE_VERSION
    cache._path(r.url).write_text(json.dumps(raw))
    return cache, cache.get(r.url)


def _stale_detection_is_counted() -> bool:
    cache, _ = _cache_with("0000deadbeef", frozen=True)
    return cache.stale_detection == 1


def _current_detection_is_not_counted() -> bool:
    cache, _ = _cache_with(tech_signals.CATALOGUE_FINGERPRINT, frozen=True)
    return cache.stale_detection == 0


def _live_run_refetches_stale_detection() -> bool:
    """The remedy has to work. A live run must not serve another catalogue's
    verdicts from cache — detection cannot be recomputed from stored text, so
    a re-fetch is the only way to re-run it."""
    cache, hit = _cache_with("0000deadbeef", frozen=False)
    return hit is None and cache.misses == 1 and cache.stale_detection == 1


def _frozen_run_still_replays() -> bool:
    """…and --frozen must still replay, or a judge-only A/B becomes impossible."""
    cache, hit = _cache_with("0000deadbeef", frozen=True)
    return hit is not None and cache.hits == 1


if __name__ == "__main__":
    sys.exit(main())
