"""Tests for the benchmark preflight (gate check for S0-17).

The point of these is that preflight must never report READY on a session that cannot
actually spend. The failure mode it exists to prevent already happened once: a probe that
returned 401 unconditionally was read as "this session predates the credential", when in
fact `api.anthropic.com` bypasses the proxy and the probe could never have passed.

So the tests pin the *classification*, not the network: each distinguishable response
shape must map to the remedy that actually fixes it.

Run:  python3 stage0/tests/test_preflight.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine import preflight  # noqa: E402


class FakeTransport:
    """Replaces `preflight._post`, replying from a queue of (status, body) pairs."""

    def __init__(self, *responses):
        self.responses = list(responses)
        self.sent: list[dict] = []

    def __call__(self, url, body, headers):
        self.sent.append(headers)
        return self.responses.pop(0) if self.responses else (0, {})


def with_transport(transport, env, fn):
    """Run `fn` with `_post` and the relevant environment variables swapped out."""
    original_post = preflight._post
    original_env = {k: preflight.os.environ.get(k) for k in env}
    preflight._post = transport
    try:
        for key, value in env.items():
            if value is None:
                preflight.os.environ.pop(key, None)
            else:
                preflight.os.environ[key] = value
        return fn()
    finally:
        preflight._post = original_post
        for key, value in original_env.items():
            if value is None:
                preflight.os.environ.pop(key, None)
            else:
                preflight.os.environ[key] = value


AUTH_ERROR = {"error": {"type": "authentication_error", "message": "invalid x-api-key"}}
NO_HEADER = {"error": {"message": "x-api-key header is required"}}


def google_error(reason, message="nope"):
    return {"error": {"message": message, "details": [{"reason": reason}]}}


# --- Anthropic ---------------------------------------------------------------


def test_egress_credential_passes_with_no_local_key():
    """The shape CLAUDE.md describes: send no auth header, the proxy supplies one."""
    transport = FakeTransport((200, {"content": []}))
    check = with_transport(transport, {"ANTHROPIC_API_KEY": None}, preflight.check_anthropic)
    assert check.ok, check.detail
    assert "x-api-key" not in transport.sent[0], "must probe with NO auth header first"


def test_nothing_attached_anywhere_is_a_fail_not_a_pass():
    """The case this session actually hit. Both probes fail; the placeholder comes back."""
    transport = FakeTransport((401, NO_HEADER), (401, AUTH_ERROR))
    check = with_transport(transport, {"ANTHROPIC_API_KEY": None}, preflight.check_anthropic)
    assert not check.ok
    assert "unmodified" in check.detail, check.detail
    assert check.remedy, "a failure without a remedy is not actionable"


def test_proxy_that_replaces_the_placeholder_passes():
    """If the proxy rewrites x-api-key, the official SDK path works and we should say so."""
    transport = FakeTransport((401, NO_HEADER), (200, {"content": []}))
    check = with_transport(transport, {"ANTHROPIC_API_KEY": None}, preflight.check_anthropic)
    assert check.ok
    assert "SDK" in check.detail


def test_environment_key_is_used_when_present():
    transport = FakeTransport((401, NO_HEADER), (200, {"content": []}))
    check = with_transport(transport, {"ANTHROPIC_API_KEY": "sk-real"}, preflight.check_anthropic)
    assert check.ok
    assert transport.sent[1]["x-api-key"] == "sk-real"


def test_present_but_rejected_key_does_not_read_as_missing():
    """A revoked key and an absent key need different fixes, so they must not share a message."""
    transport = FakeTransport((401, NO_HEADER), (401, AUTH_ERROR))
    check = with_transport(transport, {"ANTHROPIC_API_KEY": "sk-stale"}, preflight.check_anthropic)
    assert not check.ok
    assert "rejected" in check.detail
    assert "Replace it" in check.remedy


# --- Google Places -----------------------------------------------------------


def test_disabled_service_names_the_console_fix():
    transport = FakeTransport((403, google_error("SERVICE_DISABLED")))
    check = with_transport(transport, {"GOOGLE_PLACES_API_KEY": "AIza-x"}, preflight.check_google_places)
    assert not check.ok
    assert "not enabled" in check.detail
    assert "Places API (New)" in check.remedy


def test_restricted_key_is_distinguished_from_disabled_service():
    """Same 403, different fix: one enables an API, the other edits key restrictions."""
    transport = FakeTransport((403, google_error("API_KEY_SERVICE_BLOCKED")))
    check = with_transport(transport, {"GOOGLE_PLACES_API_KEY": "AIza-x"}, preflight.check_google_places)
    assert not check.ok
    assert "restricted" in check.detail
    assert "restrictions" in check.remedy


def test_missing_key_reports_missing_key():
    transport = FakeTransport((403, {"error": {"message": "denied"}}))
    check = with_transport(transport, {"GOOGLE_PLACES_API_KEY": None}, preflight.check_google_places)
    assert not check.ok
    assert "no key" in check.detail


def test_places_success_passes():
    transport = FakeTransport((200, {"places": []}))
    check = with_transport(transport, {"GOOGLE_PLACES_API_KEY": "AIza-x"}, preflight.check_google_places)
    assert check.ok


# --- Component readiness -----------------------------------------------------


def test_components_reflect_what_is_on_disk():
    """Built and unbuilt pieces must be reported as they are, not as the plan wishes.

    Checked against the filesystem rather than a hard-coded list of what is
    unbuilt. The earlier version froze the project state into an assertion and
    failed the moment `judge.py` was written — a test that breaks on progress
    tests the calendar, not the code.
    """
    for name, path in preflight.REQUIRED:
        check = next(c for c in preflight.check_components() if c.name == name)
        assert check.ok == path.exists(), (
            f"{name}: preflight says {'built' if check.ok else 'not built'}, "
            f"but {path.name} {'exists' if path.exists() else 'does not exist'}"
        )


def test_unbuilt_components_say_what_is_missing():
    """A failing component must name its remedy, not just report false."""
    for check in preflight.check_components():
        if not check.ok:
            assert check.remedy, f"{check.name} fails with no remedy"


def test_every_required_component_maps_to_a_real_task_id():
    for name, _ in preflight.REQUIRED:
        assert name.startswith("S0-"), f"{name} should name the task it gates"


def test_network_failure_is_our_problem_not_a_pass():
    """Principle 4: never blame the environment on the business — and never call it READY."""
    transport = FakeTransport((0, {"error": {"message": "ConnectError"}}), (0, {"error": {}}))
    check = with_transport(transport, {"ANTHROPIC_API_KEY": None}, preflight.check_anthropic)
    assert not check.ok


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  pass  {name}")
            except AssertionError as exc:
                failures += 1
                print(f"  FAIL  {name}: {exc}")
    print(f"\n{failures} failure(s)")
    sys.exit(1 if failures else 0)
