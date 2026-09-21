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
list of criteria. For each criterion, decide:

- "match"        — the pages show the criterion is true
- "no_match"     — the pages show the criterion is false
- "couldnt_tell" — the pages do not settle it

Rules you must follow:

1. Quote verbatim. Every verdict that is not "couldnt_tell" must include a quote
   copied exactly, character for character, from the page text you were given.
   Do not paraphrase, do not fix typos, do not add ellipses.
2. If you cannot find a verbatim quote that settles the criterion, the verdict is
   "couldnt_tell". This is a normal, useful answer, not a failure.
3. Absence is not proven by silence alone. Answer "match" for a "has no X"
   criterion only when the pages you were given are the ones that would show X
   and X is not there.
4. Never infer from the business category, the name, or what is typical. Only the
   text in front of you counts.

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
                            "description": "Verbatim from the page text, or empty for couldnt_tell.",
                        },
                        "source_url": {"type": "string"},
                        "reason": {"type": "string"},
                    },
                    "required": ["criterion_id", "verdict", "quote", "source_url", "reason"],
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
    proof_valid: bool = True
    settled_by: str = "model"  # "detector" | "model" | "absence_rule"


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


def detector_verdict(criterion: dict, read) -> CriterionVerdict | None:
    """Settle a criterion from technology detection alone, or return None.

    Only ever returns `no_match`, and only for an absence criterion: a detected
    booking vendor disproves "has no online booking" outright and needs no
    model. The converse is not symmetric and must never be added here —
    *not* detecting a signal is not proof of absence, which is the entire
    reason `absence.py` exists.

    This is the measured cost lever (S0-10): every verdict returned here is a
    model call not made.
    """
    if criterion.get("type") != "absence":
        return None

    family = next(
        (f for f, pat in FAMILY_PATTERNS if re.search(pat, criterion["text"], re.I)), None
    )
    if family is None:
        return None

    vendors = read.vendors.get(family) or []
    generic = read.generic.get(family) or []
    if not vendors and not generic:
        return None

    source = (
        f"{vendors[0]} detected in the page source" if vendors
        else "a booking or contact route was found in the page source"
    )
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

    criteria_lines = "\n".join(
        f"- id={c['id']} | type={c.get('type', 'presence')} | {c['text']}" for c in criteria
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
        settled = detector_verdict(c, read)
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
            result = judge_absence(
                AbsenceEvidence(
                    criterion_id=cid,
                    pages_read=pages_read,
                    site_outcome=read.outcome,
                    targeted_pages_read=max(pages_read - 1, 0),
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
                reason=raw.get("reason", ""),
                proof_valid=valid,
                settled_by=settled_by,
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
