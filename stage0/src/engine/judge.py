"""Criteria judgment with quoted evidence (S0-11 + S0-12).

One model call per business per search. The call is given the pages the fetcher
read and the criteria the user asked for, and must return, for each criterion, a
verdict and **a verbatim quote from those pages**.

Three rules are enforced in code rather than asked for in the prompt, because a
prompt is a request and the gate needs a guarantee:

1. **Every quote is verified verbatim against the fetched text.** A quote that
   is not found is not trusted prose to be cleaned up later — the verdict is
   downgraded to `couldnt_tell` and the failure is counted. This is S0-14's
   proof validator, applied at the point of judgment rather than after it.

   What the quote *proves* differs by criterion type, and the first version of
   this prompt got that wrong at real cost. It demanded a quote that "settles
   the criterion" for every non-abstention — but an absence is settled by text
   that is not there, so no such quote exists, and the model correctly followed
   the instruction into `couldnt_tell` on 6 of 12 businesses that genuinely
   matched. Measured recall was 6.7%. For an absence verdict the quote now
   shows the model was *looking in the right place*, and `pages_checked`
   carries the claim.
2. **Absence still needs positive proof.** A model saying "no" is not a "no".
   The verdict passes through `engine/absence.py`, which requires that the
   criterion-relevant pages were actually read. A model's "no" on a site we
   barely read comes back as couldn't-tell, as it should.
3. **Cheap signals first.** Where `tech_signals` already settled a criterion
   (a booking vendor was detected in the page source), no model call is spent
   on it. This is the 56-57% cost lever S0-10 measured, applied.

Model choice follows the product document: Haiku 4.5 for the first pass, with
`MODEL_AUDIT` re-judging borderline cases. Judgment is the highest-volume call
in the product, so this is where model choice actually moves the bill.
"""

from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine import tech_signals  # noqa: E402
from engine.absence import AbsenceEvidence, judge_absence  # noqa: E402
from engine.llm import MODEL_WORKER, CostMeter, client, timed  # noqa: E402

# Page text handed to the model, per business. Four pages of a wordy site can
# run past this; the cap keeps a single pathological business from costing ten
# times a normal one, and it is recorded so a truncation can be blamed later.
MAX_CHARS_PER_PAGE = 6000
MAX_TOTAL_CHARS = 18000

SYSTEM = """You judge whether local businesses meet criteria, from their own website text.

You will be given the text of up to four pages from one business's website, and a
list of criteria. Each criterion is marked `presence` or `absence`, and the two
take DIFFERENT evidence. This distinction is the whole job.

PRESENCE criteria — "offers Botox", "does commercial work"
  match        the pages say so. Give the verbatim quote that says it.
  no_match     the pages positively rule it out. Give the quote.
  couldnt_tell no quote settles it.

ABSENCE criteria — "has no online booking", "has no quote form"
  These are proven by what is NOT on the pages, so there is usually no quote
  saying "we have no online booking". Do not wait for one; it will not come.

  match        you read the pages where this WOULD appear if it existed, and it
               is not there. Name those pages in `pages_checked`, and quote the
               closest thing you did find — the contact instructions, the "call
               us" line, the appointment paragraph. That quote shows you were
               looking in the right place. It is not required to prove absence
               by itself.
  no_match     you found the thing. Quote it.
  couldnt_tell you were not given the pages where it would appear, or the pages
               are too thin to tell. Say which in `reason`.

Rules for every verdict:

1. Any quote you give must be copied exactly, character for character, from the
   page text you were given. Do not paraphrase or add ellipses. A quote that is
   not in the text invalidates the verdict.
2. Never infer from the business category, the name, or what is typical. Only
   the text in front of you counts.
3. For an absence criterion, "I could not find it" is a `match`, not a
   `couldnt_tell` — PROVIDED you were looking at the pages where it would be.
   If you were not, that is what `couldnt_tell` is for.

Return only the structured output requested."""

VERDICT_TOOL = {
    "name": "record_verdicts",
    "description": "Record one verdict per criterion, each with its verbatim evidence.",
    "input_schema": {
        "type": "object",
        "properties": {
            "verdicts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "criterion_id": {"type": "string"},
                        "verdict": {
                            "type": "string",
                            "enum": ["match", "no_match", "couldnt_tell"],
                        },
                        "quote": {
                            "type": "string",
                            "description": (
                                "Verbatim from the page text. For a presence match "
                                "this is the proof; for an absence match it is the "
                                "closest relevant text, showing you looked in the "
                                "right place. Empty only for couldnt_tell."
                            ),
                        },
                        "pages_checked": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": (
                                "For an absence verdict: the page URLs you examined "
                                "for this criterion. This is what makes the absence "
                                "claim checkable."
                            ),
                        },
                        "source_url": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                    "required": ["criterion_id", "verdict", "quote", "pages_checked",
                                 "source_url", "reason"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["verdicts"],
        "additionalProperties": False,
    },
}


@dataclass
class CriterionVerdict:
    criterion_id: str
    verdict: str
    quote: str = ""
    source_url: str = ""
    reason: str = ""
    # False when the model's quote could not be found in the fetched text.
    pages_checked: list = field(default_factory=list)
    proof_valid: bool = True
    settled_by: str = "model"  # "detector" | "model" | "absence_rule"
    # What the model said before the absence rule and the proof validator had
    # their say. Without this, "the engine abstained" conflates three very
    # different failures — the model was unsure, the model was sure but its
    # quote did not verify, or the model was sure and the absence rule
    # overrode it — and they need opposite fixes.
    raw_model_verdict: str = ""


@dataclass
class BusinessJudgment:
    business_id: str
    verdicts: list[CriterionVerdict] = field(default_factory=list)
    model_called: bool = False
    truncated: bool = False
    error: str | None = None


def _normalise(text: str) -> str:
    """Whitespace-insensitive comparison for quote verification.

    Verbatim means the words, not the line wrapping: HTML-to-text collapses
    differently than a model reproduces it, and failing a true quote over a
    double space would make the validator useless. Everything else — wording,
    punctuation, numbers — must match exactly.
    """
    return " ".join(text.split()).lower()


def verify_quote(quote: str, pages) -> bool:
    """Is this quote actually on one of the pages we read?"""
    if not quote.strip():
        return False
    needle = _normalise(quote)
    # A quote short enough to appear by accident proves nothing.
    if len(needle) < 12:
        return False
    return any(needle in _normalise(p.text) for p in pages)


# Which detector family bears on which criterion, by the criterion's own words.
# Text, not id: ids are per-market fixture strings and matching on them would
# tie the engine to four hand-written markets.
FAMILY_PATTERNS = [
    ("booking", r"\b(online booking|book online|appointment|booking (widget|system))\b"),
    ("quote_form", r"\b(quote|estimate|request a price)\b"),
    ("chat", r"\b(chat|live support|messenger)\b"),
]


def detector_verdict(
    criterion: dict, read, settle_on_generic: bool = True
) -> CriterionVerdict | None:
    """Settle a criterion from technology detection alone, or return None.

    Only ever returns `no_match`, and only for an absence criterion: a detected
    booking vendor disproves "has no online booking" outright and needs no
    model. The converse is not symmetric and must never be added here —
    *not* detecting a signal is not proof of absence, which is the entire
    reason `absence.py` exists.

    This is the measured cost lever (S0-10): every verdict returned here is a
    model call not made.

    **A generic signal settles it too, and escalating it to the model instead
    was tried and measured and was worse on every axis.**

    The argument for escalating was good and it was wrong. The generic patterns
    match an affordance *word* — an `/appointments/` href, a "Schedule Now"
    button — and an appointment-*request* form wears the same words while being
    the opposite answer. Wright Orthodontics is the demonstration: rejected on
    `/appointments/` and a "Schedule Now" button, when that page is a
    GoHighLevel lead form reading "complete the following form to request an
    appointment… availability will vary… your appointment will be confirmed by
    phone". The hand label says no online booking and the detector is wrong.

    So the question went to the model. Frozen corpus, same 70 labels, this one
    line different:

        generic escalates      generic settles
        23 model calls -> 51   23
        recall    26.7%        40.0%
        precision 80.0%        85.7%
        couldn't-tell 29.3% ✗  10.3% ✓
        cost/match $0.0705 ✗   $0.0249 ✓

    The mechanism, checked afterwards: the generic patterns match **raw HTML** —
    hrefs, button markup, iframe sources — and the model is given
    `Page.text`, the *visible text*. Of the sites where the generic booking
    pattern fires, **0 of 5 are still matchable in the text the model sees.**
    Escalating did not hand the question to a better judge; it handed it to the
    only party that cannot see the evidence, and the model correctly abstained.

    That reframes the two-layer rule rather than contradicting it. Detection is
    not a cheap approximation of model judgment — it is a *different sensor*,
    reading a channel the model is never shown. "A cheap optimisation over
    model judgment, never a precondition" still holds for anything the model
    could have decided for itself; it was never a licence to discard evidence.

    Wright Orthodontics stays wrong, and that is now a priced decision rather
    than an oversight: one false rejection in this slice against 28 correct
    ones, a 19-point recall drop and 2.8x the cost per match to fix it this
    way. The honest fix is to show the model the link structure so it can
    judge with the same evidence — not to blind the engine to even it up.
    """
    if criterion.get("type") != "absence":
        return None

    family = next(
        (f for f, pat in FAMILY_PATTERNS if re.search(pat, criterion["text"], re.I)), None
    )
    if family is None:
        return None

    vendors = read.vendors.get(family) or []
    generic = bool(read.generic.get(family)) and settle_on_generic
    if not vendors and not generic:
        return None

    source = (f"{vendors[0]} detected in the page source" if vendors
              else "a booking or contact route was found in the page source")
    return CriterionVerdict(
        criterion_id=criterion["id"],
        verdict="no_match",
        quote="",
        source_url=read.pages[0].url if read.pages else read.url,
        reason=f"positive signal found, so the absence claim fails: {source}",
        proof_valid=True,
        settled_by="detector",
    )


def build_prompt(read, criteria: list[dict]) -> tuple[str, bool]:
    """The page text, trimmed, plus the criteria. Returns (prompt, truncated)."""
    parts: list[str] = []
    total = 0
    truncated = False
    for page in read.pages:
        body = page.text[:MAX_CHARS_PER_PAGE]
        if len(page.text) > MAX_CHARS_PER_PAGE:
            truncated = True
        if total + len(body) > MAX_TOTAL_CHARS:
            body = body[: max(0, MAX_TOTAL_CHARS - total)]
            truncated = True
        if not body:
            break
        parts.append(f"--- PAGE: {page.url} ---\n{body}")
        total += len(body)

    # The rubric comes from `benchmarks.json`, the same field the labelling tool
    # shows the human. A criterion phrase like "has no online booking" is not
    # self-defining: a form that collects your details and says the practice
    # will call to confirm is an appointment *request*, not a booking, and a
    # reasonable judge could go either way. If the human and the model resolve
    # that differently, every disagreement is scored as an engine error when it
    # is really the two of them answering different questions — and no amount
    # of engine work fixes it, because there is nothing wrong with the engine.
    #
    # So the definition lives in one place and is rendered to both. Written
    # twice it drifts, and the drift is invisible in every number.
    criteria_lines = "\n".join(
        f"- id={c['id']} | type={c.get('type', 'presence')} | {c['text']}"
        + (f"\n    HOW TO DECIDE: {c['rubric']}" if c.get("rubric") else "")
        for c in criteria
    )
    prompt = (
        "PAGE TEXT FROM THIS BUSINESS'S WEBSITE:\n\n"
        + "\n\n".join(parts)
        + "\n\nCRITERIA TO JUDGE:\n"
        + criteria_lines
    )
    return prompt, truncated


def judge_business(
    business: dict,
    read,
    criteria: list[dict],
    *,
    meter: CostMeter,
    model: str = MODEL_WORKER,
    api=None,
    settle_on_generic: bool = True,
) -> BusinessJudgment:
    """Judge one business's criteria. One model call, or none if unreadable."""
    out = BusinessJudgment(business_id=business["id"])

    if not read.readable:
        # Never blame our own failure on the business: a site we could not read
        # is unjudged, not unmatched.
        for c in criteria:
            out.verdicts.append(
                CriterionVerdict(
                    criterion_id=c["id"],
                    verdict="couldnt_tell",
                    reason=f"site not readable ({read.outcome})",
                    settled_by="absence_rule",
                )
            )
        return out

    # Cheap signals first. Anything a detector settles is removed from the
    # prompt entirely, so it costs no tokens as well as no decision.
    remaining: list[dict] = []
    for c in criteria:
        settled = detector_verdict(c, read, settle_on_generic)
        if settled is not None:
            out.verdicts.append(settled)
        else:
            remaining.append(c)
    if not remaining:
        return out

    prompt, out.truncated = build_prompt(read, remaining)
    api = api or client()

    try:
        with timed() as t:
            resp = api.messages.create(
                model=model,
                max_tokens=2048,
                system=[{"type": "text", "text": SYSTEM}],
                messages=[{"role": "user", "content": prompt}],
                tools=[{**VERDICT_TOOL, "strict": True}],
                tool_choice={"type": "tool", "name": "record_verdicts"},
            )
    except Exception as exc:  # noqa: BLE001 — surfaced per business, run continues
        out.error = f"{type(exc).__name__}: {exc}"
        for c in criteria:
            out.verdicts.append(
                CriterionVerdict(criterion_id=c["id"], verdict="couldnt_tell",
                                 reason="model call failed", settled_by="absence_rule")
            )
        return out

    out.model_called = True
    meter.record("judge", model, resp.usage, t.seconds, business["id"])

    payload = next(
        (b.input for b in resp.content if getattr(b, "type", "") == "tool_use"), None
    )
    if not payload:
        out.error = "no tool_use block in response"
        return out

    by_id = {c["id"]: c for c in remaining}
    pages_read = len(read.pages)

    for raw in payload.get("verdicts", []):
        cid = raw.get("criterion_id", "")
        criterion = by_id.get(cid)
        if criterion is None:
            continue

        verdict = raw.get("verdict", "couldnt_tell")
        raw_verdict = verdict
        quote = raw.get("quote", "") or ""
        valid = verdict == "couldnt_tell" or verify_quote(quote, read.pages)

        # Rule 1: an unverifiable quote is not evidence. Downgrading rather than
        # dropping keeps the failure countable — S0-14 needs the rate, not a
        # silently cleaner-looking result set.
        if not valid:
            verdict = "couldnt_tell"

        settled_by = "model"
        # Rule 2: absence claims go through the absence rule regardless of what
        # the model said.
        if criterion.get("type") == "absence" and verdict == "match":
            # On a site with no other pages, the homepage is the page that
            # would show X, so reading it *is* reading the relevant pages. That
            # fact is passed as itself: an earlier version fudged
            # `targeted_pages_read` to 1 instead, which never fired, because a
            # whole-site homepage has `pages_read == 1` and the rule's
            # page-count check ran first. See `absence.py`.
            result = judge_absence(
                AbsenceEvidence(
                    criterion_id=cid,
                    pages_read=pages_read,
                    site_outcome=read.outcome,
                    targeted_pages_read=max(pages_read - 1, 0),
                    homepage_is_whole_site=bool(getattr(read, "whole_site", False)),
                    positive_signal_found=False,
                    positive_signal_source=None,
                    detector_covers_criterion=False,
                    model_found_positive=False,
                    model_abstained=False,
                )
            )
            verdict = result.verdict.value
            settled_by = "absence_rule"

        out.verdicts.append(
            CriterionVerdict(
                criterion_id=cid,
                verdict=verdict,
                quote=quote if valid else "",
                source_url=raw.get("source_url", ""),
                pages_checked=raw.get("pages_checked", []) or [],
                reason=raw.get("reason", ""),
                proof_valid=valid,
                settled_by=settled_by,
                raw_model_verdict=raw_verdict,
            )
        )

    # A criterion the model skipped is unanswered, not a no.
    answered = {v.criterion_id for v in out.verdicts}
    for c in criteria:
        if c["id"] not in answered:
            out.verdicts.append(
                CriterionVerdict(criterion_id=c["id"], verdict="couldnt_tell",
                                 reason="model returned no verdict for this criterion")
            )
    return out
