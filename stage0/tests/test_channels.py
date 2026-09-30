#!/usr/bin/env python3
"""The channel report says which door produced customers, not visitors.

    python3 stage0/tests/test_channels.py

`source` has been written on every account since migration `0012` and nothing
read it. `docs/LAUNCH.md` is blunt about the cost: *"without it no channel can
be judged"*, and where to spend more is the GTM plan's whole operating
decision.

The counting is `channel_report()`'s and was verified against the live project
on 2026-09-30 with planted rows: two workspaces from `for/acme` of which one
ran a search, one from `find/dental-phoenix` that never did, one with no source
at all, and the one real account. The rows below are those results.

What is held here is the reading, which is where a report of this kind usually
goes wrong:

- **Sign-ups by channel flatters every channel equally.** A door producing
  twenty accounts and no searches is producing nothing. The drop has to be on
  the same line as the total, and it has to be called out in words, or nobody
  reads it off the numbers.
- **A share token must never be printed.** It is a capability: anybody holding
  one opens that list. A report that printed tokens would put them in a
  terminal's scrollback, a screenshot and a support thread.
- **An unattributed account is a real account.** Dropping it would make every
  percentage on the page wrong.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src" / "gtm"))

import channels  # noqa: E402

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


# The shapes `channel_report()` actually returned, measured 2026-09-30.
MEASURED = [
    {"source": "for/acme", "workspaces": 2, "searched": 1, "spent": 0,
     "milli_spent": 0, "paid": 0, "first_seen": "2026-09-30T00:00:00+00",
     "last_seen": "2026-09-30T00:00:00+00"},
    {"source": "(none)", "workspaces": 1, "searched": 0, "spent": 0,
     "milli_spent": 0, "paid": 0, "first_seen": "2026-09-30T00:00:00+00",
     "last_seen": "2026-09-30T00:00:00+00"},
    {"source": "find/dental-phoenix", "workspaces": 1, "searched": 0, "spent": 0,
     "milli_spent": 0, "paid": 0, "first_seen": "2026-09-30T00:00:00+00",
     "last_seen": "2026-09-30T00:00:00+00"},
    {"source": "home", "workspaces": 1, "searched": 1, "spent": 0,
     "milli_spent": 0, "paid": 1, "first_seen": "2026-09-25T11:34:10+00",
     "last_seen": "2026-09-25T11:34:10+00"},
]

SHARES = [
    {"account_id": "0f39b752-df03-4981-9fea-fa5f3f390fa5", "links": 3,
     "live": 2, "views": 41, "signups": 2},
]


def main() -> int:
    out = channels.render(MEASURED, SHARES)

    # --- the drop is visible, not inferred ------------------------------
    check(
        "every channel shows what its sign-ups went on to do",
        "signed up" in out and "searched" in out and "spent" in out,
        "the columns that decide anything are missing",
    )
    check(
        "and the drop is a percentage, not arithmetic left to the reader",
        "1 (50%)" in out,
        "two workspaces, one search, and no 50% anywhere",
    )
    check(
        "an unattributed account is its own row rather than dropped",
        "(none)" in out,
        "the accounts nobody can attribute are hidden, so the percentages lie",
    )

    # --- the sentence worth reading -------------------------------------
    dead = channels.render(
        [{"source": "for/deadchannel", "workspaces": 9, "searched": 0, "spent": 0,
          "milli_spent": 0, "paid": 0, "first_seen": "", "last_seen": ""}],
        [],
    )
    check(
        "a door producing accounts that never search is named in words",
        "never search" in dead and "for/deadchannel" in dead,
        "nine sign-ups and no searches passes without comment",
    )
    check(
        "and a working channel is not accused of it",
        "never search" not in channels.render(
            [{"source": "for/good", "workspaces": 9, "searched": 9, "spent": 4,
              "milli_spent": 8000, "paid": 2, "first_seen": "", "last_seen": ""}],
            [],
        ),
    )
    check(
        "one quiet sign-up is not called a dead channel",
        # Two accounts and no searches is a Tuesday, not a finding. The
        # threshold exists so the line means something when it appears.
        "never search" not in channels.render(
            [{"source": "for/new", "workspaces": 2, "searched": 0, "spent": 0,
              "milli_spent": 0, "paid": 0, "first_seen": "", "last_seen": ""}],
            [],
        ),
    )

    # --- a token is a capability ----------------------------------------
    check(
        "no share token is printed",
        "0f39b752-df03-4981-9fea-fa5f3f390fa5" not in out,
        "the full workspace id is in the output",
    )
    check(
        "the share report still identifies the workspace enough to act on",
        "0f39b752" in out and "41" in out,
    )

    # --- empty is a sentence, not a blank --------------------------------
    empty = channels.render([], [])
    check(
        "no workspaces yet reads as a state, not a broken report",
        "No workspaces yet" in empty and "fills in on its own" in empty,
    )
    check(
        "and so does no shares yet",
        "Nobody has shared a list yet" in empty,
    )

    # --- credits are the ledger's unit -----------------------------------
    check("2,500 milli reads as 2.5 credits", channels.credits(2500) == "2.5")
    check("a whole number loses its decimals", channels.credits(8000) == "8")
    check("and zero is zero", channels.credits(0) == "0")

    check("a percentage of nothing is not a division by zero", channels.pct(0, 0) == "—")

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
