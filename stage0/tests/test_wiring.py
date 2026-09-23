"""The libraries are actually called (S1-08, S1-09, S1-11).

A module can be complete, tested and imported by nothing. `events.ts`,
`suppression.ts` and `checkout.ts` were all in that state: written, covered by
their own tests, and reachable from no screen in the product. That reads as
finished in a plan and is not.

So this checks wiring rather than behaviour — which call sites exist, and that
the guarantees hold where they have to hold. It is deliberately a grep-level
test: it cannot verify the product works, only that these pieces are connected
to it, which is the thing that was missing.

    python3 stage0/tests/test_wiring.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "src"
failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def read(*parts: str) -> str:
    return (SRC / Path(*parts)).read_text()


def all_sources() -> str:
    return "\n".join(
        p.read_text() for p in SRC.rglob("*.ts*") if p.is_file()
    )


def main() -> int:
    app = read("app", "app", "page.tsx")
    confirm = read("components", "SearchConfirm.tsx")
    sources = all_sources()

    # --- suppression reaches the product, not just the opt-out page
    check("the app applies the suppression list",
          "applySuppression" in app,
          "the opt-out page promises removal from searches, not just exports")
    check("and applies it upstream of everything shown",
          re.search(r"const inRegion = useMemo\(\s*\(\)\s*=>\s*\n?\s*applySuppression", app)
          is not None,
          "filtering at the export would leave a suppressed business on screen")
    suppressed = json.loads((ROOT / "public" / "data" / "suppressed.json").read_text())
    check("the suppression list exists and is a list",
          isinstance(suppressed.get("businessIds"), list))
    check("and says what it is for",
          "removed" in suppressed.get("note", "").lower())

    # --- events fire from the screens that matter
    for event, where, file in [
        ("count_shown", confirm, "SearchConfirm"),
        ("search_confirmed", confirm, "SearchConfirm"),
        ("export_downloaded", app, "the app"),
        ("match_refunded", app, "the app"),
    ]:
        check(f"{event} fires from {file}", f'"{event}"' in where)

    # Every event the model declares should be fired from somewhere, or it is a
    # dashboard column that will always be empty.
    declared = set(re.findall(r"^\s{2}(\w+):\s*\[", read("lib", "events.ts"), re.M))
    fired = {e for e in declared if f'track("{e}"' in sources}
    unfired = declared - fired
    check("no declared event is unfired without a reason",
          unfired <= {"scan_started", "scan_stopped", "match_unlocked",
                      "checkout_started", "checkout_blocked"},
          f"unfired: {sorted(unfired)}")
    print(f"        declared {len(declared)}, fired {len(fired)}; the rest wait on "
          f"accounts and a live scan")

    # --- and the one rule that must not be broken by a call site
    check("no call site passes a business name into an event",
          not re.search(r'track\(\s*"[a-z_]+",\s*\{[^}]*\bname\s*:', sources),
          "identifying keys are stripped at the sink, but a call site should not try")

    # --- the ledger's unit is used, not re-derived
    check("the app uses the ledger's own unit for a refund",
          "MILLI" in app,
          "a second definition of a credit is how two parts of a bill disagree")

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
