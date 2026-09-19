"""Tests for the absence-proof rule (task S0-13).

These are the most important tests in the repo. A bug here produces a confident
false match, which is the one failure the product document says destroys trust —
and unlike a missed match, the user pays for it.

Every test that expects COULDNT_TELL is guarding against a false match.

Run:  python3 stage0/tests/test_absence.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.absence import (  # noqa: E402
    MIN_PAGES_FOR_ABSENCE,
    UNREADABLE_OUTCOMES,
    AbsenceEvidence,
    Verdict,
    judge_absence,
)


def evidence(**kw) -> AbsenceEvidence:
    """A well-read site with no positive signal — i.e. a genuine match."""
    base = dict(
        criterion_id="no_online_booking",
        pages_read=4,
        site_outcome="ok",
        targeted_pages_read=2,
        positive_signal_found=False,
        detector_covers_criterion=True,
        model_found_positive=False,
    )
    base.update(kw)
    return AbsenceEvidence(**base)


# --- The good case -----------------------------------------------------------


def test_well_read_site_with_no_signal_is_a_match():
    result = judge_absence(evidence())
    assert result.verdict is Verdict.MATCH
    assert "no sign of it" in result.reason


def test_a_match_says_how_it_was_checked():
    result = judge_absence(evidence())
    assert "technology detection" in result.reason
    assert "page text" in result.reason


# --- Positive signals settle it the other way --------------------------------


def test_detector_signal_means_no_match():
    result = judge_absence(
        evidence(positive_signal_found=True, positive_signal_source="vagaro on /book")
    )
    assert result.verdict is Verdict.NO_MATCH
    assert result.proof == "vagaro on /book"


def test_model_finding_it_means_no_match():
    result = judge_absence(evidence(model_found_positive=True))
    assert result.verdict is Verdict.NO_MATCH


# --- Everything that must NOT become a match ---------------------------------


def test_every_unreadable_outcome_is_couldnt_tell():
    for outcome in sorted(UNREADABLE_OUTCOMES):
        result = judge_absence(evidence(site_outcome=outcome))
        assert result.verdict is Verdict.COULDNT_TELL, outcome
        assert outcome in result.reason


def test_blocked_site_is_never_a_match():
    """11-17% of every market is bot-blocked. If blocking read as absence, those
    would all become confident false matches."""
    result = judge_absence(evidence(site_outcome="blocked", pages_read=0))
    assert result.verdict is Verdict.COULDNT_TELL


def test_homepage_alone_cannot_prove_absence():
    result = judge_absence(evidence(pages_read=1, targeted_pages_read=1))
    assert result.verdict is Verdict.COULDNT_TELL
    assert "too little" in result.reason


def test_min_pages_threshold_is_enforced_exactly():
    assert judge_absence(evidence(pages_read=MIN_PAGES_FOR_ABSENCE)).verdict is Verdict.MATCH
    assert (
        judge_absence(evidence(pages_read=MIN_PAGES_FOR_ABSENCE - 1)).verdict
        is Verdict.COULDNT_TELL
    )


def test_missing_the_relevant_pages_is_couldnt_tell():
    """Pages were read, but not the ones that would carry the evidence. This is
    the vet-market case from the coverage report: crawling services pages says
    nothing about booking."""
    result = judge_absence(evidence(pages_read=5, targeted_pages_read=0))
    assert result.verdict is Verdict.COULDNT_TELL
    assert "none of the pages" in result.reason


def test_model_abstention_is_couldnt_tell_not_absence():
    result = judge_absence(evidence(model_abstained=True, model_found_positive=None))
    assert result.verdict is Verdict.COULDNT_TELL


def test_nothing_competent_looked_is_couldnt_tell():
    """No detector covers this criterion and no model ran. Silence from something
    that cannot see is not evidence of absence."""
    result = judge_absence(
        evidence(detector_covers_criterion=False, model_found_positive=None)
    )
    assert result.verdict is Verdict.COULDNT_TELL
    assert "nothing checked this criterion" in result.reason


def test_uncatalogued_criterion_can_still_match_on_model_evidence_alone():
    """No detector exists, but the model read the pages and found nothing. That
    is how an unanticipated vertical reaches a verdict at all."""
    result = judge_absence(
        evidence(detector_covers_criterion=False, model_found_positive=False)
    )
    assert result.verdict is Verdict.MATCH
    assert "page text" in result.reason


def test_detector_alone_can_match_when_it_covers_the_criterion():
    result = judge_absence(
        evidence(detector_covers_criterion=True, model_found_positive=None)
    )
    assert result.verdict is Verdict.MATCH


def test_positive_signal_beats_an_unread_site_check_order():
    """Ordering guard: a site marked unreadable must not be reported as no_match
    just because a stale signal was attached."""
    result = judge_absence(
        evidence(site_outcome="dead", positive_signal_found=True)
    )
    assert result.verdict is Verdict.COULDNT_TELL


def test_no_path_returns_match_without_reading_relevant_pages():
    """Exhaustive guard: sweep the decision space and assert that MATCH is only
    ever reachable when relevant pages were actually read."""
    for outcome in ["ok", "thin"]:
        for pages in range(0, 4):
            for targeted in range(0, 3):
                for detector in (True, False):
                    for model in (True, False, None):
                        for abstained in (True, False):
                            result = judge_absence(
                                evidence(
                                    site_outcome=outcome,
                                    pages_read=pages,
                                    targeted_pages_read=targeted,
                                    detector_covers_criterion=detector,
                                    model_found_positive=model,
                                    model_abstained=abstained,
                                )
                            )
                            if result.verdict is Verdict.MATCH:
                                assert pages >= MIN_PAGES_FOR_ABSENCE
                                assert targeted >= 1
                                assert not abstained
                                assert detector or model is False


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  pass  {name}")
            except AssertionError as exc:
                failures += 1
                print(f"  FAIL  {name}: {exc}")
    print(f"\n{failures} failure(s)")
    sys.exit(1 if failures else 0)
