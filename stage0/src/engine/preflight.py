"""Can the Stage 0 benchmark actually run? (gate check for S0-17)

The plan's rule is "verify before running anything that spends money", and `CLAUDE.md`
prescribed a `curl` for it. That curl was wrong, and wrong in a way that cost a session:
`api.anthropic.com` is on the agent proxy's **noProxy** list, so the request never passes
through the proxy that is supposed to attach the credential. It returns 401 whether or not
a credential exists. A probe that cannot succeed is not a test.

So the check is done here instead, and it distinguishes the cases that have different
remedies:

- **No credential anywhere.** Sending no auth header and sending a deliberate placeholder
  both fail. If the placeholder comes back `invalid x-api-key`, it reached Anthropic
  unmodified, which proves the proxy is not rewriting the header either.
- **Credential attached at egress.** Sending *no* auth header succeeds, because the proxy
  supplied the only one. This is the shape `CLAUDE.md` describes.
- **Key in the environment.** The ordinary SDK path.

The second half is cheaper and just as important: even with both keys live, the benchmark
reports nothing, because the components it runs over do not exist yet. Reporting "keys OK"
while S0-11, S0-12 and S0-16 are unbuilt would be the same class of error as calling an
unread page a "no" — a confident answer from something that never looked.

Usage:
    python3 stage0/src/engine/preflight.py

Exit code is 0 only when the benchmark could actually produce numbers.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
ENGINE = ROOT / "stage0" / "src" / "engine"
FIXTURES = ROOT / "stage0" / "fixtures"

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby"

# The smallest call that still proves the credential works end to end.
PROBE_BODY = {
    "model": os.environ.get("SMALLFISH_MODEL_WORKER", "claude-haiku-4-5"),
    "max_tokens": 4,
    "messages": [{"role": "user", "content": "ok"}],
}


@dataclass
class Check:
    name: str
    ok: bool
    detail: str
    remedy: str = ""

    def line(self) -> str:
        return f"  [{'PASS' if self.ok else 'FAIL'}] {self.name}: {self.detail}"


def _post(url: str, body: dict, headers: dict[str, str]) -> tuple[int, dict]:
    """POST returning (status, parsed body). HTTP errors are results, not exceptions."""
    request = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers={"content-type": "application/json", **headers}
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as exc:
        raw = exc.read() or b"{}"
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, {"error": {"message": raw.decode(errors="replace")[:200]}}
    except Exception as exc:  # network, DNS, TLS — our problem, never the API's
        return 0, {"error": {"message": f"{type(exc).__name__}: {exc}"}}


def check_anthropic() -> Check:
    """Distinguish egress-attached credential, environment key, and nothing at all."""
    version = {"anthropic-version": "2023-06-01"}

    status, body = _post(ANTHROPIC_URL, PROBE_BODY, version)
    if status == 200:
        return Check("Anthropic", True, "credential attached at egress (no local key needed)")

    env_key = os.environ.get("ANTHROPIC_API_KEY")
    if env_key:
        status, body = _post(ANTHROPIC_URL, PROBE_BODY, {**version, "x-api-key": env_key})
        if status == 200:
            return Check("Anthropic", True, "ANTHROPIC_API_KEY in environment works")
        message = body.get("error", {}).get("message", "")
        return Check(
            "Anthropic",
            False,
            f"ANTHROPIC_API_KEY is set but rejected ({status}: {message})",
            "The key is present but invalid or revoked. Replace it.",
        )

    # No key locally and nothing injected. Does the proxy rewrite a header we do send?
    status, body = _post(ANTHROPIC_URL, PROBE_BODY, {**version, "x-api-key": "placeholder"})
    if status == 200:
        return Check("Anthropic", True, "proxy replaces the x-api-key header (SDK path works)")

    message = body.get("error", {}).get("message", "")
    if "invalid x-api-key" in message:
        detail = "no credential by any path — the placeholder reached Anthropic unmodified"
    else:
        detail = f"no credential ({status}: {message})"
    return Check(
        "Anthropic",
        False,
        detail,
        "Add an Anthropic egress credential (api.anthropic.com, header x-api-key, empty "
        "prefix) and start a NEW session — credentials attach only to sessions created "
        "after them. Note that api.anthropic.com is on the proxy's noProxy list, so an "
        "egress credential may not be attachable here at all; an ANTHROPIC_API_KEY "
        "environment variable is then the only working path.",
    )


def check_google_places() -> Check:
    """`searchNearby` is used deliberately: it names the disabled service, `searchText` does not."""
    key = os.environ.get("GOOGLE_PLACES_API_KEY")
    headers = {"X-Goog-FieldMask": "places.id"}
    if key:
        headers["X-Goog-Api-Key"] = key

    body = {
        "locationRestriction": {
            "circle": {"center": {"latitude": 32.7767, "longitude": -96.797}, "radius": 1000.0}
        },
        "maxResultCount": 1,
    }
    status, payload = _post(PLACES_URL, body, headers)
    if status == 200:
        source = "GOOGLE_PLACES_API_KEY" if key else "egress credential"
        return Check("Google Places", True, f"reachable via {source}")

    error = payload.get("error", {})
    reason = next((d.get("reason") for d in error.get("details", []) if d.get("reason")), "")
    message = error.get("message", "")

    if reason == "SERVICE_DISABLED":
        return Check(
            "Google Places",
            False,
            "key is valid but Places API (New) is not enabled on the project",
            "Enable 'Places API (New)' for the project named in the error and confirm "
            "billing is active. This is a Cloud Console change, not a code change.",
        )
    if reason == "API_KEY_SERVICE_BLOCKED":
        return Check(
            "Google Places",
            False,
            "key is valid but restricted away from Places API (New)",
            "Add 'Places API (New)' to the key's API restrictions in the Cloud Console.",
        )
    if not key:
        return Check(
            "Google Places",
            False,
            f"no key and nothing attached at egress ({status})",
            "Set GOOGLE_PLACES_API_KEY or add a places.googleapis.com egress credential "
            "(header X-Goog-Api-Key, empty prefix).",
        )
    return Check("Google Places", False, f"{status} {reason} {message}"[:160].strip())


# What S0-17 needs before it can report a single number. Present ones are ticked in the
# plan; the rest are the honest reason the benchmark cannot run today.
REQUIRED = [
    ("S0-13 absence-proof rule", ENGINE / "absence.py"),
    ("S0-15 cost meter", ENGINE / "llm.py"),
    ("S0-29 geometry", ENGINE / "geometry.py"),
    ("S0-32 check plans", ENGINE / "check_plan.py"),
    ("S0-08 polite fetcher", ENGINE / "fetcher.py"),
    ("S0-11 profile extraction", ENGINE / "profile.py"),
    ("S0-12 criteria judge", ENGINE / "judge.py"),
    ("S0-14 proof validator", ENGINE / "proof.py"),
    ("S0-16 hand-labelled set", FIXTURES / "labels.json"),
    ("S0-17 benchmark harness", ROOT / "stage0" / "src" / "benchmark" / "run.py"),
]


def check_components() -> list[Check]:
    return [
        Check(
            name,
            path.exists(),
            "present" if path.exists() else f"not built ({path.relative_to(ROOT)})",
            "" if path.exists() else "Build it, or the benchmark has nothing to measure.",
        )
        for name, path in REQUIRED
    ]


def main() -> int:
    credentials = [check_anthropic(), check_google_places()]
    components = check_components()

    print("Stage 0 benchmark preflight\n")
    print("Credentials")
    for check in credentials:
        print(check.line())

    print("\nPipeline components")
    for check in components:
        print(check.line())

    blockers = [c for c in credentials + components if not c.ok]
    print()
    if not blockers:
        print("READY — the Stage 0 benchmark can run.")
        return 0

    print(f"NOT READY — {len(blockers)} blocker(s).\n")
    for check in blockers:
        if check.remedy:
            print(f"  {check.name}: {check.remedy}")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
