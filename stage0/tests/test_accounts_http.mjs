/**
 * The account repository survives the responses PostgREST actually sends (S1-08).
 *
 * This exists because of a bug that reached a real customer. `ensureWorkspace`
 * creates three things in order — an account row, a membership row, then the
 * period's credit grant — and the membership insert sends
 * `Prefer: return=minimal`, to which PostgREST replies **201 Created with an
 * empty body**. The helper guarded against 204 only, so `res.json()` threw on
 * an empty string, and the function died between step two and step three.
 *
 * What that looked like from outside was the worst version of the failure: an
 * account that existed, with a member, a plan, a read allowance shown on
 * screen — and **zero credits**, silently. Not an error page. A funded-looking
 * account with no funds. The row is what settled it: `period_start` was equal
 * to `created_at` to the microsecond, and `renew_period` sets
 * `period_start = now()`, so it had plainly never run.
 *
 * The checks below drive the real module against a stubbed `fetch`, so they
 * exercise the parsing rather than asserting that some source text is present.
 *
 *     node stage0/tests/test_accounts_http.mjs
 */

import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service";

const { dir, load } = compileLib(
  ["src/lib/accounts.ts", "src/lib/pricing.ts", "src/lib/ledger.ts", "src/lib/db.ts"],
  "sfacct-",
);
const { ensureWorkspace, accountForUser, balanceOf } = await load("accounts");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

/** Answers the way PostgREST does, including the empty bodies. */
function stubFetch(script) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url).split("/rest/v1/")[1];
    const method = init?.method ?? "GET";
    calls.push(`${method} ${path.split("?")[0]}`);
    const reply = script(path, method, init);
    return {
      ok: reply.status < 400,
      status: reply.status,
      text: async () => reply.body ?? "",
    };
  };
  return calls;
}

// --- the exact shape that broke -------------------------------------------
{
  let created = false;
  const calls = stubFetch((path, method) => {
    if (path.startsWith("account_members") && method === "GET") {
      // No membership the first time; the row exists once created.
      return { status: 200, body: created ? '[{"accounts":{"id":"acc-1"}}]' : "[]" };
    }
    if (path.startsWith("accounts") && method === "POST") {
      return { status: 201, body: '[{"id":"acc-1","plan_id":"free"}]' };
    }
    if (path.startsWith("account_members") && method === "POST") {
      created = true;
      // Prefer: return=minimal — 201, and NOT A 204, with no body at all.
      return { status: 201, body: "" };
    }
    if (path.startsWith("rpc/renew_period")) {
      return { status: 200, body: '[{"carried":0,"expired":0,"granted":20000}]' };
    }
    return { status: 200, body: "[]" };
  });

  let error = null;
  let result = null;
  try {
    result = await ensureWorkspace({
      clerkUserId: "user_abc",
      name: "Test",
      planId: "free",
      allowanceMilli: 20000,
      planName: "Free",
    });
  } catch (e) {
    error = e;
  }

  check(
    "a 201 with an empty body does not throw",
    error === null,
    error ? String(error.message).slice(0, 90) : "",
  );
  check("the workspace is reported created", result?.created === true && !!result?.accountId);
  check(
    "and the credit grant is actually reached",
    calls.some((c) => c.includes("rpc/renew_period")),
    `calls were: ${calls.join(" | ")} — this is the bug: the member insert threw ` +
      `and renew_period never ran, leaving a workspace with no credits`,
  );
  check(
    "in the right order — account, member, then the grant",
    JSON.stringify(calls.filter((c) => c.startsWith("POST"))) ===
      JSON.stringify(["POST accounts", "POST account_members", "POST rpc/renew_period"]),
    calls.join(" | "),
  );
}

// --- it must still be idempotent ------------------------------------------
{
  const calls = stubFetch((path, method) => {
    if (path.startsWith("account_members") && method === "GET") {
      return { status: 200, body: '[{"accounts":{"id":"acc-existing","plan_id":"free"}}]' };
    }
    return { status: 200, body: "[]" };
  });
  const again = await ensureWorkspace({
    clerkUserId: "user_abc",
    allowanceMilli: 20000,
    planName: "Free",
  });
  check(
    "an existing member creates nothing new",
    again.created === false && again.accountId === "acc-existing",
  );
  check(
    "and grants no second period",
    !calls.some((c) => c.includes("renew_period")),
    "a second grant is free credits minted by reloading a page",
  );
}

// --- a genuine 204, and a genuine failure ----------------------------------
{
  stubFetch(() => ({ status: 204, body: "" }));
  let threw = null;
  try {
    await accountForUser("user_x");
  } catch (e) {
    threw = e;
  }
  check("a real 204 is still handled", threw === null);

  stubFetch(() => ({ status: 500, body: "boom" }));
  let err = null;
  try {
    await balanceOf("acc-1");
  } catch (e) {
    err = e;
  }
  check(
    "a server error still throws, rather than reading as an empty balance",
    err !== null && /500/.test(String(err.message)),
    "a swallowed error here shows a customer a zero balance they do not have",
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
