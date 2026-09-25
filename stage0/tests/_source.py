"""Read source as *code*, with the prose taken out.

Not a test — the leading underscore keeps it out of `run_all.py`'s glob.

This exists because the same mistake has now been made four times in this
repository's own tests, in four different files:

  * `test_schema.py` failed "no floating-point column anywhere near money"
    because a migration comment used the word *real*.
  * It failed again on "the schema does not restate pricing" because a comment
    explained why bands are deliberately not in SQL.
  * `test_optout.mjs` failed "the route never sets `effective_at`" because the
    route's docstring says, at length, that it never writes it.
  * `test_auth_wiring.py` failed "user.deleted removes the membership, not the
    ledger" because the handler's docstring explains why the ledger is left
    alone.

Every one is the same error: a check about what the code **does**, run against
what the code **says**. The failure mode is seductive rather than obvious —
these checks all pass on a codebase with no comments, which is precisely the
codebase where they are least useful, so the greener the suite looks the less
it may be checking.

A check about wording should read the raw text. A check about behaviour should
read this.
"""

from __future__ import annotations

import re

# `--` to end of line (SQL), `//` to end of line and `/* … */` (TS/JS).
_SQL_LINE = re.compile(r"--[^\n]*")
_JS_LINE = re.compile(r"^[ \t]*//.*$", re.M)
_BLOCK = re.compile(r"/\*[\s\S]*?\*/")
# A string concatenation split across lines, so a check matches the sentence a
# user reads rather than how the line happened to wrap.
_JOIN = re.compile(r'"\s*\+\s*"')


def code_of(text: str, *, sql: bool = False, join_strings: bool = False) -> str:
    """Source with comments removed. `sql=True` also strips `-- …` lines."""
    out = _BLOCK.sub("", text)
    out = _JS_LINE.sub("", out)
    if sql:
        out = _SQL_LINE.sub("", out)
    if join_strings:
        out = _JOIN.sub("", out)
    return out
