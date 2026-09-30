/**
 * A list a customer shares (P1).
 *
 *     node stage0/tests/test_share.mjs
 *
 * The flow document's read-only shared view and the GTM plan's referral loop are
 * one page: a customer sends a list to somebody who would also want it, the
 * recipient sees three of it in full, signs up for the rest, and the sharer is
 * credited.
 *
 * The token behaviour was proven against the live database before the pages were
 * written: sharing twice returns one token; it is URL-safe and 22 characters;
 * opening increments the view count; an unknown token resolves to nothing;
 * revoking works once and the link then stops opening; a second workspace cannot
 * revoke a link that is not theirs; and sharing again after a revoke mints a
 * **new** token rather than resurrecting the dead one.
 *
 * What is held here is the part a database cannot hold — **what the link is
 * allowed to show**. A share link that handed over the sharer's paid rows would
 * make the paywall a formality for anybody with one friend, and it is the kind
 * of leak that is invisible until somebody notices they are not being charged.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

let failures = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`  pass  ${name}`);
  } catch (e) {
    failures += 1;
    console.log(`  FAIL  ${name}: ${e.message}`);
  }
};

const read = (p) => readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * The file with its comments taken out.
 *
 * `_source.py` carries this for the Python side and says why: two checks in
 * `test_schema.py` alone have fired on the comment *explaining* why the thing
 * they look for is absent. This file did it too — the refusal check below
 * matched the sentence "whether it was already revoked or belongs to somebody
 * else" in a comment describing the very behaviour it was asserting.
 *
 * Deliberately crude. It only has to be right about this repository's own
 * source, where `//` inside a string literal does not occur in the places these
 * checks read.
 */
const code = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const page = read("src/app/list/[token]/page.tsx");
const route = read("src/app/api/share/route.ts");
const sql = read("supabase/migrations/0019_shared_lists.sql");

/* ------------------------------------------- the link shows the free preview -- */

test("the shared page builds its list with no unlocks at all", () => {
  // Not a special rule written here: it is the product with an empty wallet,
  // so a shared list cannot drift from what a signed-out visitor sees.
  const call = page.slice(page.indexOf("buildLeads({"), page.indexOf("buildLeads({") + 400);
  assert.ok(!/unlocked/.test(call), "buildLeads is given unlocks on the shared page");
  assert.ok(!/preview:/.test(call), "the shared page sets its own preview size");
});

test("and shows only the rows that came back unlocked", () => {
  assert.match(page, /result\.leads\.filter\(\(l\) => !l\.locked\)/);
  // The list rendered must be that filtered set, never `result.leads`.
  assert.ok(
    !/result\.leads\.map\(/.test(page),
    "the page maps every lead, including the locked ones",
  );
});

test("it says what the recipient will and will not see, on the page", () => {
  assert.match(page, /not theirs to hand on|paid for their copy/);
});

test("and the share button says it before the link is made", () => {
  const button = read("src/components/ShareList.tsx");
  assert.match(button, /never the ones you paid to unlock/);
});

/* ------------------------------------------------------- a token is a secret -- */

test("the token is minted by the database, not by the application", () => {
  assert.match(sql, /gen_random_bytes\(16\)/);
  assert.ok(
    !/randomUUID|Math\.random|crypto\.getRandomValues/.test(route),
    "the route generates its own token",
  );
});

test("and it is URL-safe, because its only job is to sit in a URL", () => {
  assert.match(sql, /translate\(encode\(gen_random_bytes\(16\), 'base64'\), '\+\/=', '-_'\)/);
  assert.match(sql, /token ~ '\^\[A-Za-z0-9_-\]\{16,64\}\$'/);
});

test("no client policy can select by token", () => {
  // A policy that let a client select by token would let a client enumerate
  // every token. Resolution is service-role only.
  assert.match(sql, /for select using \(public\.member_of \(account_id\)\)/);
  assert.ok(
    !/using \(true\)|using \(token/.test(sql),
    "a policy exposes the table by token",
  );
  assert.match(sql, /revoke all on function public\.open_shared_list \(text\) from public, anon, authenticated/);
});

test("an unknown token and a revoked one are the same answer", () => {
  // Telling a stranger "this was revoked" confirms it once existed, and the
  // person revoking it wanted it to stop meaning anything.
  assert.match(page, /notFound\(\)/);
  assert.ok(
    !/revoked|expired|no longer/i.test(
      page.slice(page.indexOf("const shared ="), page.indexOf("const shared =") + 200),
    ),
    "the page distinguishes a revoked link from a wrong one",
  );
});

test("and the revoke route will not confirm a token it did not revoke", () => {
  const bare = code(route);
  const del = bare.slice(bare.indexOf("export async function DELETE"));
  assert.match(del, /That link is not active\./);
  assert.ok(
    !/not yours|belongs to|already revoked/i.test(del),
    "the refusal says which case it was",
  );
});

/* ------------------------------------------------------------ the referral -- */

test("sign-up from a shared list carries who shared it", () => {
  assert.match(page, /source: `share\/\$\{token\}`/);
});

test("and the sign-up link carries the search, so nothing is retyped", () => {
  const block = page.slice(page.indexOf("const signUp ="), page.indexOf("const signUp =") + 400);
  assert.match(block, /q: query/);
  assert.match(block, /market: shared\.market_id/);
  assert.match(block, /criterion: shared\.criterion_id/);
});

/* ------------------------------------------------------------ not indexed -- */

test("a share link is not indexed", () => {
  // It carries three real businesses' names, and they did not agree to appear
  // in a search result.
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});

/* ------------------------------------------------- revoke means revoke -- */

test("sharing again after a revoke mints a new token", () => {
  // `share_list` only reuses a row whose `revoked_at is null`, so the dead
  // token stays dead. Otherwise "revoke" would mean "until you press Share".
  const fn = sql.slice(sql.indexOf("function public.share_list"));
  assert.match(fn.slice(0, 900), /and revoked_at is null/);
});

test("and the row survives a revoke, so its view count is not lost", () => {
  const fn = sql.slice(sql.indexOf("function public.revoke_shared_list"));
  assert.match(fn.slice(0, 700), /set revoked_at = now\(\)/);
  assert.ok(!/delete from public\.shared_lists/.test(fn.slice(0, 700)));
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
