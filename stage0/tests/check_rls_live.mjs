/**
 * What an anonymous caller can actually read from the live database.
 *
 *     node stage0/tests/check_rls_live.mjs
 *
 * **Named `check_`, not `test_`, and that is deliberate.** `run_all.py`
 * discovers `test_*`, and this one needs a network and a real project. Wired
 * into the suite it would skip on every machine that has no keys and report a
 * pass, which is the worst of both: a green tick that means "not run". So it is
 * a probe you run against a deployment, and `docs/LAUNCH-CHECKLIST.md` names
 * it.
 *
 * ## Why it exists
 *
 * On 2026-09-25, row-level security on `ledger_entries` was correct and every
 * workspace's balance was still world-readable, because `account_balances` is a
 * view and a view runs as its owner unless it is told otherwise. Reading the
 * policies would never have found it — the policies were right. Only asking the
 * untrusted role did.
 *
 * The rule this encodes: **a permission is what the anon key gets back, not
 * what the migration says it should get back.** Every table this touches is one
 * a mistake would leak money or identities through.
 *
 * It uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the key that ships in the browser
 * bundle — on purpose. Running it with the service-role key would prove
 * nothing, so it refuses to run if handed one.
 */

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!url || !anon) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the\n" +
      "publishable key, not the service role key) and run this again.",
  );
  process.exit(2);
}

// A service-role key would pass every check below by bypassing the thing being
// checked. Its JWT carries `"role":"service_role"`; refuse rather than report a
// meaningless pass.
try {
  const claims = JSON.parse(Buffer.from(anon.split(".")[1] ?? "", "base64").toString());
  if (claims.role && claims.role !== "anon") {
    console.error(
      `That key has role "${claims.role}". This probe is only meaningful with the ` +
        "anon/publishable key — a service-role key bypasses RLS and would pass everything.",
    );
    process.exit(2);
  }
} catch {
  // A publishable key in the newer `sb_publishable_…` format is not a JWT and
  // has no claims to read. Carrying on is right: that format is anon by
  // construction, so there is nothing to refuse.
}

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

async function get(path) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
    cache: "no-store",
  });
  const text = await res.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

console.log(`\nProbing ${url} as the anon role\n`);

// --- money -------------------------------------------------------------------
// Three shapes are acceptable here and one is not. 401/403 (the grant is gone)
// and an empty array (RLS returned nothing) are both fine. A balance is not.
for (const [label, path] of [
  ["balances", "account_balances?select=*"],
  ["ledger entries", "ledger_entries?select=*"],
  ["unlocks", "unlocks?select=*"],
  ["accounts", "accounts?select=*"],
  ["members", "account_members?select=*"],
  ["webhook receipts", "webhook_events?select=*"],
]) {
  const { status, body } = await get(path);
  const empty = Array.isArray(body) && body.length === 0;
  const refused = status === 401 || status === 403 || status === 404;
  check(
    `anon reads no ${label}`,
    refused || empty,
    `status ${status}, ${Array.isArray(body) ? `${body.length} row(s)` : "non-array body"}`,
  );
}

// --- writes ------------------------------------------------------------------
// A client that can insert a ledger entry can grant itself credits. This is the
// one check whose failure is an emergency rather than a leak.
const mint = await fetch(`${url}/rest/v1/ledger_entries`, {
  method: "POST",
  headers: {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    "Content-Type": "application/json",
    Prefer: "return=minimal",
  },
  body: JSON.stringify({
    account_id: "00000000-0000-0000-0000-000000000000",
    kind: "grant",
    milli: 1_000_000,
    why: "RLS probe — this must never be accepted.",
  }),
});
check(
  "anon cannot mint credits",
  mint.status >= 400,
  `insert into ledger_entries returned ${mint.status}`,
);

// --- what is meant to be public ----------------------------------------------
// The opt-out list has to stay readable without a key: the app filters counts,
// pins, rows and exports against it. A probe that only checked for tightness
// would happily pass on a database that had locked this away too.
const sup = await get("suppressions?select=business_id&limit=1");
check(
  "the suppression list is still readable without signing in",
  sup.status === 200 && Array.isArray(sup.body),
  `status ${sup.status}`,
);

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
