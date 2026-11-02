/**
 * Which listings a job reads: one read per website, and no chains.
 *
 * Asserts the properties rather than one example, because the example that
 * found the bug (ten of twelve gym slots on 24hourfitness.com) would pass a
 * rule that was wrong in the other direction — one that dropped every Wix site
 * as a "chain".
 */

import { compileLib } from "./_tsmodules.mjs";

const { load } = compileLib(["src/lib/worklist.ts"], "sfwl-");
const W = await load("worklist");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

const row = (id, site) => ({ id, site });

/* ----------------------------------------------- the job that found it -- */
{
  const gyms = [
    ...Array.from({ length: 10 }, (_, i) => row(`f${i}`, `https://www.24hourfitness.com/club/${i}`)),
    row("a", "https://ironworksgym.com"),
    row("b", "http://www.dallasboxing.net/"),
  ];
  const w = W.workList(gyms, { dropChains: true });
  check("a chain behind ten listings is left out of a search", !w.rows.some((r) => r.id.startsWith("f")));
  check("and the two small gyms are still read", w.rows.map((r) => r.id).join() === "a,b");
  check("and the chain is reported, not silently missing", w.chains[0]?.site === "24hourfitness.com" && w.chains[0].listings === 10);
}

/* --------------------------------------------- properties, any input -- */
const sample = [
  row(1, "https://smith.wixsite.com/dental"),
  row(2, "https://jones.wixsite.com/dental"),
  row(3, "https://lee.wixsite.com/home"),
  row(4, "https://park.wixsite.com/x"),
  row(5, "https://kim.wixsite.com/y"),
  row(6, "https://cho.wixsite.com/z"),
  row(7, "http://WWW.Acme-Dental.com/"),
  row(8, "https://acme-dental.com/contact"),
  row(9, "acme-dental.com"),
  row(10, null),
  row(11, "not a url at all ::"),
  row(12, "https://two-offices.com/east"),
  row(13, "https://two-offices.com/west"),
];
const w = W.workList(sample, { dropChains: true });
const keys = w.rows.map((r) => W.siteKey(r.site)).filter(Boolean);

check("no website is read twice", new Set(keys).size === keys.length);
check(
  "six businesses on one website builder are six businesses, not a chain",
  [1, 2, 3, 4, 5, 6].every((id) => w.rows.some((r) => r.id === id)),
  "the host is the key; a registrable-domain key would delete the smallest businesses first",
);
check("www, case and scheme do not make one site three", w.rows.filter((r) => [7, 8, 9].includes(r.id)).length === 1);
check("the first listing of a site is the one kept", w.rows.some((r) => r.id === 7));
check(
  "a practice with two offices on one site is read once and not called a chain",
  w.rows.filter((r) => [12, 13].includes(r.id)).length === 1 && !w.chains.length,
);
check("a row with no usable site is passed through for the read to explain", [10, 11].every((id) => w.rows.some((r) => r.id === id)));
check(
  "every row is accounted for",
  w.rows.length + w.duplicates + w.chains.reduce((a, c) => a + c.listings, 0) === sample.length,
);
check(
  "the order the caller chose is kept",
  w.rows.map((r) => r.id).join() === [...w.rows].sort((a, b) => sample.indexOf(a) - sample.indexOf(b)).map((r) => r.id).join(),
);

/* ------------------------------------------------- the line for a chain -- */
const many = (n) => Array.from({ length: n }, (_, i) => row(i, `https://brand.com/loc/${i}`));
check("four listings on one site is a small business with several doors", W.workList(many(4), { dropChains: true }).rows.length === 1);
check("five is a chain", W.workList(many(5), { dropChains: true }).rows.length === 0 && W.CHAIN_MIN === 5);

/* --------------------------------------------- an upload is theirs -- */
{
  const up = W.workList(many(8), { dropChains: false });
  check("a customer's own list is never cut for being a chain", up.rows.length === 1 && up.chains.length === 0);
  check("but is still read once per site", up.duplicates === 7);
}

/* ------------------------------------- a street address is not a name -- */
for (const n of ["2710 Gateway Oaks Drive Suite 150N", "123 Main St", "45 N. Elm Street, Ste 200", "9000 W Sunset Blvd #4", "1200 Park Avenue"]) {
  check(`"${n}" is a street address, not a business`, W.isStreetAddress(n));
}
for (const n of ["16 Park Dental Care", "170th Dental", "123 Plumbing", "1-800-Plumber", "24 Hour Plumbers Plano", "Main Street Dental", "Abbott and Kindermann LLP", "5and2", null]) {
  check(`"${n}" stays`, !W.isStreetAddress(n));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
