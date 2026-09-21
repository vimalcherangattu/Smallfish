"""The absence-proof rule (task S0-13).

The most expensive mistake this product can make is showing a business as a match
when it isn't. For an absence criterion — "no online booking", "no quote form" —
that mistake has a specific, common cause: **we didn't look in the right place, and
called finding nothing a finding.**

So absence is never inferred from silence. A "no" requires all of:

1. The pages that would carry the evidence were actually read.
2. Nothing on them positively indicates the thing.
3. Enough of the site was readable to believe (1).

If any fails, the verdict is `couldn't tell` with the reason — which the user is
never charged for. The whole position in the product document ("'Couldn't tell' is
an honest answer… a forced guess looks identical to a real match and destroys
trust") reduces to this function behaving correctly.

Empirically, this matters most in verticals we have not catalogued. Booking signals
appeared only beyond the homepage in 0–1.6% of med spa, dental and HVAC sites, but
7.1% of vet sites, because the vet check plan targeted different pages. See
`docs/stage0-coverage-report.md` §5a.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class Verdict(str, Enum):
    MATCH = "match"
    NO_MATCH = "no_match"
    COULDNT_TELL = "couldnt_tell"


# Outcomes from `site_probe.classify` that mean we did not really read the site.
UNREADABLE_OUTCOMES = {
    "blocked",
    "robots_blocked",
    "dead",
    "http_error",
    "timeout",
    "js_shell",
    "social_only",
    "probe_error",
    "unknown",
}

# A homepage alone is not enough to prove absence: it is one page, and the evidence
# may live one click away. Measured hiding rates are low but not zero.
#
# Unless the homepage IS the site — see `homepage_is_whole_site`. The rule guards
# against "we did not look in the right place"; when the site has nowhere else to
# look, one page is the whole of it.
MIN_PAGES_FOR_ABSENCE = 2


@dataclass
class AbsenceEvidence:
    """What was actually read, and what was found, for one absence criterion."""

    criterion_id: str
    pages_read: int
    site_outcome: str
    # Did the crawl reach pages the check plan considered relevant?
    targeted_pages_read: int = 0
    # True when the homepage is the entire site — no internal links, nothing we
    # failed to fetch. Then a one-page read is a complete read, and both the
    # page-count and the targeted-page checks below are satisfied by it.
    #
    # This has to be its own field rather than a caller fudging
    # `targeted_pages_read` to 1, which is what `judge.py` did. That fudge was
    # dead code from the day it was written: a whole-site homepage has
    # `pages_read == 1` by construction, so the page-count check below returned
    # couldn't-tell before `targeted_pages_read` was ever consulted. The fix for
    # one-page sites could not fire on a one-page site.
    homepage_is_whole_site: bool = False
    # Any positive signal for the thing whose absence is claimed.
    positive_signal_found: bool = False
    positive_signal_source: str | None = None
    # True when technology detection can speak to this criterion at all. When a
    # criterion has no detector, silence from the detector means nothing.
    detector_covers_criterion: bool = False
    # The model's reading of the page text, if it ran.
    model_found_positive: bool | None = None
    model_abstained: bool = False
    notes: list[str] = field(default_factory=list)


@dataclass
class AbsenceResult:
    verdict: Verdict
    reason: str
    proof: str | None = None


def judge_absence(ev: AbsenceEvidence) -> AbsenceResult:
    """Decide an absence criterion. Defaults to couldn't tell, never to 'no'."""

    # 1. Did we read the site at all?
    if ev.site_outcome in UNREADABLE_OUTCOMES:
        return AbsenceResult(
            Verdict.COULDNT_TELL,
            reason=f"site not readable ({ev.site_outcome})",
        )

    # 2. A positive signal settles it immediately and cheaply — this is the one
    #    direction where finding something is conclusive.
    if ev.positive_signal_found:
        return AbsenceResult(
            Verdict.NO_MATCH,
            reason="positive signal found, so the absence claim fails",
            proof=ev.positive_signal_source,
        )
    if ev.model_found_positive:
        return AbsenceResult(
            Verdict.NO_MATCH,
            reason="the site says it has this",
            proof=ev.positive_signal_source,
        )

    # 3. Did we look in enough places to trust the silence?
    #    A complete one-page site passes both checks: there is no second page to
    #    read and no other page the criterion could be hiding on. Anything short
    #    of complete — an internal link we did not follow, a fetch that failed —
    #    leaves `homepage_is_whole_site` false and the checks apply as normal.
    if not ev.homepage_is_whole_site:
        if ev.pages_read < MIN_PAGES_FOR_ABSENCE:
            return AbsenceResult(
                Verdict.COULDNT_TELL,
                reason=f"only {ev.pages_read} page(s) read; too little to prove absence",
            )
        if ev.targeted_pages_read < 1:
            return AbsenceResult(
                Verdict.COULDNT_TELL,
                reason="none of the pages the criterion needs were reached",
            )
    elif ev.pages_read < 1:
        # Belt and braces: "the homepage is the whole site" cannot be true of a
        # read with no pages in it, but the caller supplies both facts and they
        # could disagree.
        return AbsenceResult(
            Verdict.COULDNT_TELL,
            reason="no pages were read",
        )

    # 4. Was anything actually capable of noticing the thing?
    #    A detector that does not cover this criterion finding nothing is not
    #    evidence, and a model that declined to answer is not evidence either.
    if ev.model_abstained:
        return AbsenceResult(
            Verdict.COULDNT_TELL,
            reason="the evidence was read but not conclusive",
        )
    if not ev.detector_covers_criterion and ev.model_found_positive is None:
        return AbsenceResult(
            Verdict.COULDNT_TELL,
            reason="nothing checked this criterion: no detector covers it and no model ran",
        )

    # 5. Pages that would carry it were read, something competent looked, and
    #    nothing was found. That is positive proof of absence.
    checked_by = []
    if ev.detector_covers_criterion:
        checked_by.append("technology detection")
    if ev.model_found_positive is False:
        checked_by.append("page text")
    where = (
        "the whole site (one page, no others to read)"
        if ev.homepage_is_whole_site
        else f"{ev.targeted_pages_read} relevant page(s)"
    )
    return AbsenceResult(
        Verdict.MATCH,
        reason=f"{where} read via {' and '.join(checked_by)}; no sign of it",
    )
