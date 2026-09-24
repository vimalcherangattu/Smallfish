"""The schema enforces the rules that cost money to get wrong (S1-08, S1-09).

Every check here corresponds to something `ledger.ts` already refuses in
TypeScript. That is the point: a rule enforced only in application code holds
until the second caller, and billing gets a second caller — a webhook, a
backfill, a support action. The database is where "impossible" can actually
mean impossible.

This reads the migration rather than a live database, because the database does
not exist yet and the migration is the artifact that will create it. A lint,
not an integration test, and it says so. It catches the specific losses:

  * a missing primary key on (account_id, business_id) is a double charge
  * a mutable ledger is a balance whose history is a suggestion
  * an RLS write policy on a billing table is a customer who can grant
    themselves credits
  * `numeric` or `real` for milli-credits is the floating-point drift
    `ledger.ts` spends four paragraphs avoiding

    python3 stage0/tests/test_schema.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))

failures: list[str] = []


def check(name: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  pass  {name}")
    else:
        failures.append(name)
        print(f"  FAIL  {name}{': ' + detail if detail else ''}")


def table(sql: str, name: str) -> str:
    """The body of `create table public.<name> ( ... );`"""
    m = re.search(
        rf"create table public\.{name}\s*\((.*?)\n\);", sql, re.S | re.I
    )
    return m.group(1) if m else ""


def main() -> int:
    check("there is a migration to read", bool(MIGRATIONS))
    if not MIGRATIONS:
        return 1
    sql = "\n".join(p.read_text() for p in MIGRATIONS)
    lower = sql.lower()

    # --- the double-charge guard -----------------------------------------
    unlocks = table(sql, "unlocks")
    check(
        "unlocks is keyed on (account_id, business_id)",
        re.search(r"primary key\s*\(\s*account_id\s*,\s*business_id\s*\)", unlocks, re.I)
        is not None,
        "without this, two concurrent requests both pass the JS check and both "
        "charge for the same business",
    )

    # --- money is an integer ---------------------------------------------
    ledger = table(sql, "ledger_entries")
    check(
        "milli-credits are stored as an integer type",
        re.search(r"\bmilli\s+bigint\b", ledger, re.I) is not None,
        "numeric/real/float here is the drift ledger.ts exists to avoid",
    )
    check(
        "no floating-point column anywhere near money",
        not re.search(r"\b(real|double precision|float)\b", lower),
    )
    check(
        "every ledger line has to say what it was for",
        "why" in ledger and re.search(r"why\s+text not null", ledger, re.I) is not None,
        "a ledger line nobody can explain is a verdict without a quote",
    )

    # --- the ledger is append-only ---------------------------------------
    check(
        "UPDATE on ledger_entries is refused by a trigger",
        re.search(r"create trigger \w+\s+before update on public\.ledger_entries", lower)
        is not None,
    )
    check(
        "DELETE on ledger_entries is refused by a trigger",
        re.search(r"create trigger \w+\s+before delete on public\.ledger_entries", lower)
        is not None,
    )

    # --- no client may write to a billing table --------------------------
    billing = ["accounts", "account_members", "ledger_entries", "unlocks", "events"]
    for t in billing:
        check(
            f"RLS is enabled on {t}",
            re.search(rf"alter table public\.{t}\s+enable row level security", lower)
            is not None,
        )
    policies = re.findall(
        r"create policy\s+(\w+)\s+on\s+public\.(\w+)\s+for\s+(\w+)", lower
    )
    writes = [(n, t, op) for n, t, op in policies if op != "select" and t in billing]
    check(
        "no write policy exists on any billing table",
        not writes,
        f"found {writes} — a client that can insert a ledger entry can grant "
        f"itself credits",
    )

    # --- the suppression list is readable, and only the right part of it --
    check(
        "the suppression list is publicly readable",
        re.search(
            r"create policy \w+ on public\.suppressions\s+for select", lower
        )
        is not None,
        "the app filters every count, pin, row and export against it",
    )
    check(
        "and only rows already in effect are served",
        re.search(
            r"create policy \w+ on public\.suppressions\s+for select\s+using \(effective_at is not null\)",
            lower,
        )
        is not None,
        "serving a request inside its seven-day window applies a removal before "
        "it was processed",
    )
    supp = table(sql, "suppressions")
    for column in ["email", "phone_number", "contact", "claim_value"]:
        check(
            f"the suppression row does not keep the requester's {column}",
            column not in supp.lower(),
            "keeping contact details for someone who asked to be removed is a "
            "strange way to honour it",
        )

    # --- events carry no identities --------------------------------------
    events = table(sql, "events")
    check(
        "the events table rejects identifying keys",
        "events_carry_no_identities" in events,
        "events.ts strips them at the sink; this is the second line",
    )

    # --- the atomic charge -----------------------------------------------
    check(
        "charge_for_match locks the account row",
        re.search(r"charge_for_match.*?for update", lower, re.S) is not None,
        "otherwise two charges can both spend the last credit",
    )
    check(
        "and is not callable by a client",
        re.search(r"revoke all on function public\.charge_for_match", lower) is not None,
    )
    # The pricing rules must NOT be restated in SQL: two sources of truth about
    # money is the failure this split exists to prevent. Comments are stripped
    # first — the comment explaining why bands are absent from the schema
    # should not be what trips a check on bands being absent from the schema.
    code = re.sub(r"--[^\n]*", "", lower)
    for term in ["band", "wilson", "settle", "0.15", "read_allowance"]:
        check(
            f"the schema does not restate pricing ({term})",
            term not in code,
            "bands and settlement live in pricing.ts, tested without a database",
        )

    print(f"\n{len(failures)} failure(s)")
    print("  note: a lint over the migration, not a live database test — "
          "the database does not exist yet")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
