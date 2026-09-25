"""Login is wired without taking the site down or leaking the key (S1-08).

Two failures are possible here and both are severe, so both get checks rather
than care.

**Taking the live site down.** `<ClerkProvider>` throws without a publishable
key and the root layout wraps every page, so mounting it unconditionally on a
deployment whose keys are not set yet turns the marketing site, the templates,
the benchmark, the free count and the opt-out form into 500s — none of which
need login at all. Verified live before this test existed: all fourteen routes
still return 200 with no Clerk key present.

**Leaking the service-role key.** `lib/accounts.ts` holds the key that bypasses
every row-level policy in the database. One `"use client"` file importing it
for convenience ships that key to every browser, and nothing about the page
would look wrong. The check below walks every client component.

    python3 stage0/tests/test_auth_wiring.py
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _source import code_of  # noqa: E402

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


def main() -> int:
    clerk = read("lib", "clerk.ts")
    layout = read("app", "layout.tsx")
    middleware = read("middleware.ts")
    accounts = read("lib", "accounts.ts")
    # Prose for the checks about wording, `code` for the checks about
    # behaviour. See `_source.py` — this distinction has caught four tests.
    hook_prose = read("app", "api", "clerk", "webhook", "route.ts")
    hook = code_of(hook_prose)

    # --- the site survives having no keys --------------------------------
    check(
        "ClerkProvider is mounted conditionally",
        "CLERK_ENABLED ?" in layout or "CLERK_ENABLED\n" in layout,
        "it throws without a publishable key, and this layout wraps every page",
    )
    check(
        "the middleware passes through when Clerk is off",
        re.search(r"if \(!CLERK_ENABLED\) return NextResponse\.next\(\)", middleware) is not None,
    )
    for page in [
        ("app", "sign-in", "[[...sign-in]]", "page.tsx"),
        ("app", "sign-up", "[[...sign-up]]", "page.tsx"),
        ("app", "account", "page.tsx"),
    ]:
        check(
            f"{page[1]} degrades instead of crashing",
            "CLERK_ENABLED" in read(*page) and "NoAuth" in read(*page),
        )

    # --- the free count stays anonymous ----------------------------------
    protected = re.search(r"export const PROTECTED = \[(.*?)\]", clerk, re.S)
    listed = re.findall(r'"([^"]+)"', protected.group(1) if protected else "")
    check(
        "/app is not behind a login",
        "/app" not in listed,
        "the free match count is anonymous by design — the product's argument "
        "for it is that a buyer sees a real number before deciding we are worth "
        "an account",
    )
    check(
        "and neither is anything public",
        not ({"/", "/pricing", "/templates", "/benchmark", "/compare", "/opt-out"} & set(listed)),
        f"protected: {listed}",
    )

    # --- the service-role key cannot reach a browser ---------------------
    check(
        "accounts.ts refuses to run in a browser",
        'typeof window !== "undefined"' in accounts and "throw new Error" in accounts,
    )
    client_files = [
        p
        for p in SRC.rglob("*.tsx")
        if p.is_file() and re.match(r'^\s*"use client"', p.read_text())
    ] + [
        p
        for p in SRC.rglob("*.ts")
        if p.is_file() and re.match(r'^\s*"use client"', p.read_text())
    ]
    offenders = [
        str(p.relative_to(ROOT))
        for p in client_files
        if re.search(r'from "@/lib/(accounts|db)"', p.read_text())
    ]
    check(
        "no client component imports accounts.ts or db.ts",
        not offenders,
        f"{offenders} would ship the service-role key to every browser",
    )
    print(f"        checked {len(client_files)} client component(s)")
    check(
        "the service-role key is never given a NEXT_PUBLIC_ name",
        not re.search(r"NEXT_PUBLIC_\w*SERVICE_ROLE", "\n".join(
            p.read_text() for p in SRC.rglob("*.ts*") if p.is_file()
        )),
        "that prefix compiles a value into every browser's JavaScript",
    )

    # --- the webhook -----------------------------------------------------
    body_at = hook.index("await request.text()")
    verify_at = hook.index(".verify(")
    check(
        "the webhook verifies the signature before acting on the body",
        verify_at > body_at and hook.index("ensureWorkspace(") > verify_at,
        "this is a public URL that creates accounts and grants credits",
    )
    check(
        "a missing signing secret is a 500, not a 200",
        re.search(r"CLERK_WEBHOOK_SIGNING_SECRET is not set", hook_prose) is not None
        and re.search(r'"Bad signature\."', hook) is not None,
        "a 200 tells Clerk the event was handled and it stops retrying, so "
        "every signup before the secret was set would be silently dropped",
    )
    check(
        "workspace creation is idempotent",
        "const existing = await accountForUser" in accounts
        and "return { accountId: existing.id, created: false }" in accounts,
        "a webhook is delivered at least once; a second user.created must not "
        "mint a second free grant",
    )
    check(
        "user.deleted removes the membership, not the ledger",
        "account_members" in hook and "ledger" not in hook.split("user.deleted")[1][:600],
        "a deletion request is answered by closing the account, never by "
        "destroying the record of what someone was charged",
    )

    # --- the money split holds --------------------------------------------
    check(
        "the band is settled in TypeScript and handed to Postgres",
        "settleBand(" in accounts and "p_cost_milli" in accounts,
        "the database must not learn what a band is — two sources of truth "
        "about a price diverge on the first pricing change",
    )

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
