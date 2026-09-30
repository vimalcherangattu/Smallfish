#!/usr/bin/env python3
"""Which door brought the customers who actually did something.

    python3 stage0/src/gtm/channels.py

Reads `channel_report()` and `share_report()` — migration `0020` — with the
service-role key, and prints them. Nothing here computes a number; the database
does, so this report and any other reader cannot disagree about what a channel
produced.

## Why a script and not a screen

The question is the founder's, not a customer's. A page would need an admin
allow-list, which is a third authorisation surface on a product that has two,
for a report one person reads. Every other measurement in this project is a
tool under `stage0/` run against real data, and this is one more.

## What it is careful about

**Sign-ups by channel is the number that flatters every channel equally.** A
door that produces twenty accounts and no searches is producing nothing, and the
only way to see that is to put the columns side by side — so `searched` and
`spent` sit next to `workspaces` and the drop between them is printed as a
percentage rather than left to be worked out.

It **never prints a share token**. Tokens are capabilities: anybody holding one
can open that list. A report that printed them would leak them into a terminal's
scrollback, a screenshot and a support thread.

Needs `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the
environment. It says so plainly rather than failing at the request.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

REQUIRED = ("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY")


def rpc(name: str) -> list[dict]:
    """Call a Postgres function through PostgREST, as the service role."""
    url = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    req = urllib.request.Request(
        f"{url}/rest/v1/rpc/{name}",
        data=b"{}",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8") or "[]")


def credits(milli: int) -> str:
    """Milli-credits as credits. `ledger.ts` formats these the same way; the
    unit is milli because a quarter-credit unlock plus floating point is an
    account that does not balance."""
    return f"{milli / 1000:,.2f}".rstrip("0").rstrip(".") or "0"


def pct(part: int, whole: int) -> str:
    return "—" if not whole else f"{100 * part / whole:.0f}%"


def table(rows: list[list[str]], heads: list[str]) -> str:
    widths = [max(len(h), *(len(r[i]) for r in rows)) if rows else len(h)
              for i, h in enumerate(heads)]
    out = ["  ".join(h.ljust(widths[i]) for i, h in enumerate(heads))]
    out.append("  ".join("-" * w for w in widths))
    for r in rows:
        out.append("  ".join(r[i].ljust(widths[i]) for i in range(len(heads))))
    return "\n".join(out)


def render(channels: list[dict], shares: list[dict]) -> str:
    """The report as text.

    Separated from `main` so it can be tested against the shapes the database
    actually returns, without a database. The rows in the test are the ones
    measured against the live project on 2026-09-30.
    """
    out: list[str] = ["Channels — workspaces, and what they went on to do", ""]

    if not channels:
        out.append("  No workspaces yet. Every door writes `source` at sign-up, so")
        out.append("  this fills in on its own once anybody arrives.")
    else:
        rows = []
        for c in channels:
            w = int(c["workspaces"])
            rows.append([
                str(c["source"]),
                str(w),
                f'{c["searched"]} ({pct(int(c["searched"]), w)})',
                f'{c["spent"]} ({pct(int(c["spent"]), w)})',
                credits(int(c["milli_spent"])),
                str(c["paid"]),
                str(c["last_seen"])[:10],
            ])
        out.append(table(
            rows,
            ["source", "signed up", "searched", "spent", "credits", "paid", "latest"],
        ))

        total = sum(int(c["workspaces"]) for c in channels)
        searched = sum(int(c["searched"]) for c in channels)
        out.append("")
        out.append(f"  {total} workspaces, {searched} of which ran a search ({pct(searched, total)}).")
        # The sentence worth reading. A channel is not the one with the most
        # sign-ups; it is the one whose sign-ups do something.
        dead = [c["source"] for c in channels
                if int(c["workspaces"]) >= 3 and int(c["searched"]) == 0]
        if dead:
            out.append(f"  Producing accounts that never search: {', '.join(dead)}.")

    out += ["", "Shares — the referral loop", ""]
    if not shares:
        out.append("  Nobody has shared a list yet.")
    else:
        rows = [[
            # The workspace, not the token. Tokens are capabilities and do not
            # belong in a terminal's scrollback.
            str(s["account_id"])[:8],
            str(s["links"]),
            str(s["live"]),
            str(s["views"]),
            str(s["signups"]),
        ] for s in shares]
        out.append(table(rows, ["workspace", "links", "live", "opens", "sign-ups"]))

    return "\n".join(out)


def main() -> int:
    missing = [k for k in REQUIRED if not os.environ.get(k)]
    if missing:
        print("Cannot read the database. Missing: " + ", ".join(missing))
        print()
        print("These are the same two variables the app uses. The service-role")
        print("key is server-only and must never be given a NEXT_PUBLIC_ prefix.")
        return 2

    try:
        channels = rpc("channel_report")
        shares = rpc("share_report")
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        print(f"The database refused the request ({e.code}). {body}")
        return 1
    except urllib.error.URLError as e:
        print(f"Could not reach the database: {e.reason}")
        return 1

    print(render(channels, shares))
    return 0


if __name__ == "__main__":
    sys.exit(main())
