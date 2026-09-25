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
  // Superseded 2026-09-25. This block used to assert that `startCheckout`
  // refused *even with credentials present*, because the session call was
  // deliberately unwritten until real keys existed. The keys exist and it is
  // written, so that assertion is now wrong to keep — but the property it was
  // protecting is not. It was never "refuse always"; it was **never return a
  // session url that was not obtained from Stripe**, because a checkout that
  // silently no-ops in development is how billing ships untested.
  //
  // So the check becomes: with plausible-looking but fake keys, it must fail
  // against Stripe and say why, rather than inventing a url.
  const full = Object.fromEntries(C.REQUIRED_ENV.map(([k]) => [k, "sk_test_not_a_real_key"]));
  const r = await C.startCheckout(
    { planId: "starter", returnUrl: "/", accountId: "acc-1" },
    full,
  );
  check("with fake keys it fails against Stripe rather than inventing a url",
    r.ok === false && !("url" in r),
    `got ${JSON.stringify(r).slice(0, 120)}`);
  check("and passes Stripe's own refusal through",
    /Stripe refused the checkout/.test(r.reason ?? ""),
    '"something went wrong" on a payment screen is where customers stop');
}
{
  // A price id must exist for the plan being bought, and the mapping must run
  // both directions without drifting — a price that maps to the wrong plan
  // grants the wrong number of credits.
  const env = {
    STRIPE_PRICE_STARTER: "price_S", STRIPE_PRICE_GROWTH: "price_G",
    STRIPE_PRICE_AGENCY: "price_A",
  };
  check("a plan resolves to its price id", C.priceIdFor("growth", env) === "price_G");
  check("and a price id resolves back to that same plan",
    C.planForPriceId("price_G", env)?.id === "growth");
  check("an unknown price id resolves to nothing, rather than a default",
    C.planForPriceId("price_ZZZ", env) === undefined,
    "defaulting here grants credits for a plan nobody bought");
  check("and a missing price id is not treated as a match",
    C.planForPriceId(null, env) === undefined &&
      C.planForPriceId(undefined, {}) === undefined);
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
