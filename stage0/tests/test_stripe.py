"""The payment path refuses rather than guesses (S1-08).

This is the one handler where being wrong costs real money in both directions:
miss an event and a paying customer has no credits; apply one twice and we mint
a month nobody paid for, into an append-only ledger that cannot be corrected by
deletion.

So the checks here are about the refusals, not the happy path. Each one
corresponds to a way of being quietly wrong:

  * matching a payment to a workspace by **email** credits the wrong account
    when someone pays with a different address from the one they signed up
    with — which is common, not exotic
  * taking the account id from the **request body** lets any caller attach a
    card to somebody else's workspace
  * reading the webhook body as **JSON** before verifying breaks every
    signature, because the bytes must be exactly as sent
  * returning **200** on a missing credential tells Stripe the payment was
    handled and it stops retrying
  * choosing a plan by the **amount paid** grants the wrong credits the day two
    plans cost the same

    python3 stage0/tests/test_stripe.py
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
    hook_prose = read("app", "api", "stripe", "webhook", "route.ts")
    hook = code_of(hook_prose)
    checkout_prose = read("lib", "checkout.ts")
    checkout = code_of(checkout_prose)
    start_prose = read("app", "api", "checkout", "route.ts")
    start = code_of(start_prose)
    migrations = code_of(
        "\n".join(p.read_text() for p in sorted((ROOT / "supabase" / "migrations").glob("*.sql"))),
        sql=True,
    )

    # --- the signature ----------------------------------------------------
    check(
        "the webhook verifies against the raw body, not parsed JSON",
        "request.text()" in hook and "request.json()" not in hook,
        "constructEvent needs the bytes exactly as sent; parsing and "
        "re-serialising changes them and every signature fails",
    )
    body_at = hook.index("request.text()")
    verify_at = hook.index("constructEvent")
    check(
        "and verifies before acting on anything",
        verify_at > body_at and hook.index("handle(event)") > verify_at,
    )
    check(
        "an unsigned request is a 400, which Stripe does not retry",
        re.search(r'"Bad signature\."[^}]*\}\s*,\s*\{\s*status:\s*400', hook, re.S) is not None,
        "an unsigned request is not a delivery that failed, it is one that "
        "should not have been made",
    )
    check(
        "a missing credential is a 500, which Stripe does retry",
        re.search(r"STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY is not set", hook_prose)
        is not None
        and re.search(r"status:\s*500", hook) is not None,
        "a 200 would tell Stripe it was handled, losing the payment",
    )

    # --- whose payment is it ----------------------------------------------
    check(
        "the workspace comes from client_reference_id or metadata",
        "client_reference_id" in hook and "metadata?.account_id" in hook,
    )
    check(
        "never from an email address",
        not re.search(r"customer_email|customer_details\?\.email|\bemail\b", hook),
        "a customer can pay with a different address from the one they signed "
        "up with, and matching on it credits the wrong workspace",
    )
    check(
        "a missing account id refuses instead of guessing",
        hook.count("Nothing was applied.") >= 2,
        "crediting the wrong workspace is worse than crediting none — the "
        "payer still has nothing and someone else silently gained a month",
    )

    # --- who can start a checkout -----------------------------------------
    check(
        "the account id for a checkout comes from the session",
        "accountForUser(userId)" in start and "auth()" in start,
    )
    check(
        "and never from the request body",
        not re.search(r"\.accountId\s*(\?\?|\|\|)?\s*[^;]*await request\.json", start)
        and "accountId: account.id" in start,
        "a client that can name the account can attach a card to someone else's",
    )
    check(
        "a signed-out request is refused, not redirected to a payment page",
        "status: 401" in start,
    )

    # --- which plan -------------------------------------------------------
    check(
        "the plan is chosen by price id, not by the amount paid",
        "planForPriceId" in checkout and "planForPriceId" in hook,
    )
    check(
        "and the webhook refuses when it cannot tell which plan",
        "Could not tell which plan" in hook_prose,
        "two plans could one day cost the same",
    )
    # The behaviour — an unknown price id resolving to nothing rather than a
    # default — is asserted by *running* the function in test_s1_platform.mjs.
    # This check only guards that that assertion still exists. The first version
    # here grepped for `return id ? PLANS.find(`, which broke the moment the
    # function was refactored while behaving identically: a test that fails on a
    # rename is testing the author, not the code.
    platform = (ROOT / "stage0" / "tests" / "test_s1_platform.mjs").read_text()
    check(
        "an unknown price id is covered behaviourally, not by grepping source",
        'planForPriceId("price_ZZZ"' in platform and "=== undefined" in platform,
        "if that assertion is deleted, nothing checks that an unrecognised "
        "price fails to grant credits",
    )

    # --- applied at most once ---------------------------------------------
    check(
        "the event id is claimed by a primary key",
        re.search(r"create table if not exists public\.webhook_events[^;]*id\s+text primary key",
                  migrations, re.S)
        is not None,
    )
    check(
        "in the same transaction as the credit grant",
        re.search(
            r"function public\.apply_paid_period.*?insert into public\.webhook_events.*?"
            r"perform public\.renew_period",
            migrations,
            re.S,
        )
        is not None,
        "two round trips leave a gap, and Stripe's retries are fast enough to "
        "land inside it",
    )
    check(
        "a repeat returns applied=false rather than raising",
        "unique_violation" in migrations and "Already applied." in migrations,
    )
    check(
        "and apply_paid_period is not callable by a client",
        re.search(r"revoke all on function public\.apply_paid_period", migrations) is not None,
    )

    # --- cancellation ------------------------------------------------------
    check(
        "a cancelled subscription does not touch the ledger",
        "downgradeToFree" in hook
        and not re.search(r"customer\.subscription\.deleted.*?ledger", hook, re.S),
        "credits already paid for are theirs until the period rolls, and the "
        "record of what they were charged is what a dispute needs",
    )

    # --- the one-dollar verification plan ----------------------------------
    pricing = read("lib", "pricing.ts")
    check(
        "the verification plan is not in PLANS",
        re.search(r"export const PLANS: Plan\[\] = \[(.*?)\];", pricing, re.S)
        and "verify" not in re.search(r"export const PLANS: Plan\[\] = \[(.*?)\];", pricing, re.S).group(1),
        "anything iterating PLANS would show customers a $1 plan, or reason "
        "about a margin that is not a real product",
    )
    check(
        "it grants one credit, so its ledger line is true",
        re.search(r"VERIFICATION_PLAN: Plan = \{[^}]*credits:\s*1", pricing, re.S) is not None,
        "pointing a real plan's price at a $1 product writes 'Starter: 120 "
        "credits' into an append-only ledger for a dollar",
    )
    check(
        "and it exists only while STRIPE_PRICE_TEST is set",
        "env.STRIPE_PRICE_TEST" in checkout and "verificationEnabled" in checkout,
    )

    # --- what is deliberately absent ---------------------------------------
    check(
        "payment failure is left unhandled, and says so",
        "invoice.payment_failed" not in code_of(hook_prose, join_strings=True)
        or "Dunning" in hook_prose,
        "stubbing dunning would make it look handled",
    )

    print(f"\n{len(failures)} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
