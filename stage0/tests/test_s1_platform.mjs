/** Checkout, suppression and event instrumentation (S1-08, S1-09, S1-11).
 *
 *  Three small modules, and what each is tested for is its refusal:
 *  a checkout that will not pretend, an opt-out that will not let a stranger
 *  erase a competitor, and an event pipeline that will not leak the thing
 *  customers pay for.
 *
 *  node stage0/tests/test_s1_platform.mjs
 */

import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

const { dir, load } = compileLib(
  ["src/lib/checkout.ts", "src/lib/suppression.ts", "src/lib/events.ts",
   "src/lib/pricing.ts"],
  "sfs1-",
);
const C = await load("checkout");
const S = await load("suppression");
const E = await load("events");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else { failures++; console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`); }
};

// ---------------------------------------------------------------- checkout
{
  const r = await C.startCheckout({ planId: "starter", returnUrl: "/" }, {});
  check("with no keys, checkout refuses", r.ok === false);
  check("and names every missing credential at once, not one per attempt",
    r.missing.length === C.REQUIRED_ENV.length, `named ${r.missing.length}`);
  check("and says plainly that nothing was charged",
    /Nothing was charged/.test(r.reason));
}
{
  const full = Object.fromEntries(C.REQUIRED_ENV.map(([k]) => [k, "x"]));
  const r = await C.startCheckout({ planId: "starter", returnUrl: "/" }, full);
  check("with keys present it still refuses, because the call is unwritten",
    r.ok === false && r.missing.length === 0);
  check("and says so rather than returning a fake session url",
    /not written yet/.test(r.reason),
    "a checkout that silently no-ops in dev is how billing ships untested");
}
{
  const r = await C.startCheckout({ planId: "free", returnUrl: "/" }, {});
  check("the free plan needs no checkout", !r.ok && /free plan/.test(r.reason));
  const bad = await C.startCheckout({ planId: "nope", returnUrl: "/" }, {});
  check("an unknown plan is refused by name", !bad.ok && /"nope"/.test(bad.reason));
}

// ------------------------------------------------------------- suppression
const listing = { site: "https://www.smilesonbell.com/", phone: "+16022964664" };

check("an address at the listed domain verifies",
  S.verifies({ method: "domain", value: "owner@smilesonbell.com" }, listing));
check("so does the bare domain",
  S.verifies({ method: "domain", value: "smilesonbell.com" }, listing));
check("the listed phone verifies, however it is punctuated",
  S.verifies({ method: "phone", value: "(602) 296-4664" }, listing));

check("a gmail address does NOT verify",
  !S.verifies({ method: "domain", value: "someone@gmail.com" }, listing),
  "an opt-out anyone can trigger is a way to erase a competitor");
check("a different business's domain does not verify",
  !S.verifies({ method: "domain", value: "rival@othercompany.com" }, listing));
check("a different phone does not verify",
  !S.verifies({ method: "phone", value: "+16025550000" }, listing));
check("an empty claim does not verify",
  !S.verifies({ method: "phone", value: "" }, listing) &&
  !S.verifies({ method: "domain", value: "" }, listing));

{
  const ok = S.requestRemoval(
    { businessId: "b1", claim: { method: "domain", value: "o@smilesonbell.com" },
      at: "2026-09-23T00:00:00.000Z" }, listing);
  check("a verified request is accepted", ok.accepted === true);
  check("with a removal date seven days out",
    ok.accepted && ok.removeBy.startsWith("2026-09-30"), ok.removeBy);
  check("and it says plainly that exported rows cannot be recalled",
    ok.accepted && /cannot recall/.test(ok.note),
    "claiming otherwise would be the overclaim the whole product refuses");

  const no = S.requestRemoval(
    { businessId: "b1", claim: { method: "domain", value: "x@gmail.com" },
      at: "2026-09-23T00:00:00.000Z" }, listing);
  check("an unverified request is refused with a way forward",
    !no.accepted && /listed phone number/.test(no.reason));
  check("an unknown business is refused",
    !S.requestRemoval({ businessId: "?", claim: { method: "phone", value: "1" },
                        at: "2026-09-23T00:00:00.000Z" }, null).accepted);
}

{
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const out = S.applySuppression(rows, new Set(["b"]));
  check("a suppressed business is removed before anything is shown or billed",
    out.map((r) => r.id).join("") === "ac");
}

// ------------------------------------------------------------------ events
{
  const { props, dropped } = E.scrub({
    market: "dental-phoenix", matched: 41,
    name: "Grabow Endodontics", phone: "+1", site: "x.com", addr: "1 St",
  });
  check("an event keeps its counts", props.matched === 41 && props.market);
  check("and drops every identifying key",
    ["name", "phone", "site", "addr"].every((k) => !(k in props)),
    `kept ${Object.keys(props)}`);
  check("and reports what it dropped, so a leaking call site is found",
    dropped.length === 4);
}
{
  E.clearSinks();
  const seen = [];
  E.addSink((e) => seen.push(e));
  E.addSink(() => { throw new Error("analytics is down"); });
  const ev = E.track("match_unlocked", { band_credits: 2, milli_charged: 2000, name: "X" });
  check("a thrown sink cannot break the product", seen.length === 1);
  check("scrubbing happens at the sink, not at the call site",
    !("name" in ev.props) && ev.props.dropped_identifying_keys === "name");
  E.clearSinks();
}
{
  check("a stopped scan must carry its reason and reads",
    E.missingProps("scan_stopped", { reason: "x" }).join(",") === "reads,matched",
    "without them a stopped scan cannot be told from a finished one");
  check("a complete event is complete",
    E.missingProps("scan_stopped", { reason: "x", reads: 200, matched: 2 }).length === 0);
  check("every event name declares what it must carry",
    Object.keys(E.REQUIRED_PROPS).length >= 9);
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
