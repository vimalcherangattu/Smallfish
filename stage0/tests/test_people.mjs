/**
 * Named contacts: owners, founders and credentialed staff, off the business's
 * own site, and whose mailbox each address is.
 *
 * GTM stream, 2026-11-02: zero of 3,700+ agency prospects carried a person's
 * name. The owner, 2026-10-15: a named person is the contact, a role mailbox
 * the fallback, never conflated. Precision first — a wrong name in an opener
 * ("Hi Services,") is worse than none — so the traps here matter as much as
 * the hits. Every case below is a real shape seen on a real site on
 * 2026-11-02, or the trap that shape suggests.
 */

import { readFileSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

delete process.env.ANTHROPIC_API_KEY;

const { load } = compileLib(
  ["src/lib/contacts.ts", "src/lib/read.ts", "src/lib/seller.ts", "src/lib/signals.ts", "src/lib/types.ts", "src/lib/fetchoutcome.ts"],
  "sf-people-",
);
const C = await load("contacts");
const R = await load("read");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};
const people = (text) => C.peopleIn([{ url: "https://x.com/about", text }]).map((p) => `${p.name} | ${p.role}`);

/* --------------------------------------------------------------- hits -- */
const hits = [
  ["Meet the team Maria Lopez, Owner Maria has run the salon since 2009.", "Maria Lopez | Owner"],
  ["Owner: James O'Brien Call us today", "James O'Brien | Owner"],
  ["Dr. Sarah Kim, DDS - Founder & CEO of Bright Dental", "Dr. Sarah Kim | Founder & CEO"],
  ["Acme Plumbing was founded by Raj Patel in 1998.", "Raj Patel | Founder or owner"],
  ["Kevin Murphy Owner Licensed and insured", "Kevin Murphy | Owner"],
  ["Priya Raman is the founder of Glow Studio", "Priya Raman | Founder"],
  ["Ronald McDonald, President", "Ronald McDonald | President"],
  ["Dr. Ahmed Jaheen DDS Dr Alla Gizerskaya DMD", "Dr. Ahmed Jaheen | Dentist"],
  ["Antonio Cutlatsakes, D.D.S. is the dentist at 16 Park", "Antonio Cutlatsakes | Dentist"],
  ["Dr. Lena Ortiz, MD", "Dr. Lena Ortiz | Physician"],
  ["Mary Jones, CPA and partner", "Mary Jones | CPA"],
];
for (const [text, want] of hits) {
  const got = people(text);
  check(`finds "${want}"`, got[0] === want, JSON.stringify(got));
}

/* -------------------------------------------------------------- traps -- */
const traps = [
  "Our Team Office Manager Free Estimates Call Now",
  "Family Owned, Owner Operated since 1980",
  "Services Owner Operated Business",
  "Director of Marketing Jane Smith",
  "Smile Dental, Owner",
  "Visit our office in Downtown Baltimore, MD today", // a state, not a doctor
  "Washington, DC office",
  "We do care. Please do call",
  "Partner Network Programs, Director",
  // The CPA site that produced these on 2026-11-02: "experienced" and
  // "consultation" are words in the site's own prose, so they are not names.
  "Expert Consultation Experienced, CPA Our experienced team offers consultation.",
];
for (const text of traps) {
  const got = people(text);
  check(`no name in "${text.slice(0, 48)}"`, got.length === 0, JSON.stringify(got));
}
check("at most three people a site", C.peopleIn([{ url: "u", text: "Dr. Ann Lee DDS Dr. Bo Yoon DDS Dr. Cy Park DDS Dr. Di Kim DDS" }]).length === 3);

/* ------------------------------------------------- whose mailbox -- */
{
  const ppl = [{ name: "Maria Lopez", role: "Owner", email: null, page: "", how: "" }];
  const tier = (e) => C.emailTier(e, ppl);
  check("info@, hello@, frontdesk@, bookings@ are role mailboxes", ["info@a.com", "hello@a.com", "frontdesk@a.com", "bookings@a.com", "sales2@a.com"].every((e) => tier(e) === "role"));
  check("the named person's address is theirs", ["maria@a.com", "mlopez@a.com", "maria.lopez@a.com", "lopez@a.com"].every((e) => tier(e) === "person"));
  check("first.last is a person even with an unlisted first name", tier("rob.gerwing@a.com") === "person");
  check("a business-name mailbox is neither", tier("acmeplumbing@gmail.com") === "other");
  check("the person is paired with their own address", C.emailFor("Maria Lopez", [{ value: "info@a.com" }, { value: "mlopez@a.com" }]) === "mlopez@a.com");
  check("and never with somebody else's", C.emailFor("Maria Lopez", [{ value: "john@a.com" }]) === null);
}
{
  const c = C.contactsFrom({
    pages: [{ url: "https://salon.com/about", text: "Lopez Salon. Maria Lopez, Owner. info@salon.com acmesalon@gmail.com maria@salon.com" }],
    business: { name: "Lopez Salon", site: "https://salon.com" },
  });
  check("emails come out person, then other, then role", c.emails.map((e) => e.tier).join() === "person,other,role", c.emails.map((e) => e.value + ":" + e.tier).join());
  check("so 'the first email' is now the most personal one", c.emails[0].value === "maria@salon.com");
  check("and the person carries it", c.people[0]?.email === "maria@salon.com");
}
{
  const c = C.contactsFrom({
    pages: [{ url: "https://portal.gov/", text: "Federal health portal. Maria Lopez, Owner." }],
    business: { name: "Crain Dds", site: "https://portal.gov" },
  });
  check("a page we cannot attribute to the business names nobody", !c.people?.length && !!c.withheld);
}

/* ----------------------------------- the About page, read for contacts only -- */
{
  const html = (u, body) => {
    const r = new Response(`<html><body>${body}</body></html>`, { status: 200, headers: { "content-type": "text/html" } });
    Object.defineProperty(r, "url", { value: u });
    return r;
  };
  const home = `<a href="/about-us">About us</a><a href="/book">Book</a><p>${"Acme Plumbing in Tampa, call us for leaks and drains. ".repeat(12)}</p>`;
  const asked = [];
  globalThis.fetch = async (input) => {
    const u = String(input);
    if (u.endsWith("/robots.txt")) return new Response("", { status: 404 });
    asked.push(u);
    if (u.endsWith("/about-us")) return html(u, "<p>Acme Plumbing was founded by Raj Patel in 1998. Raj leads every job.</p>");
    if (u.endsWith("/book")) return html(u, "<p>Acme Plumbing booking: call us to book.</p>");
    return html(u, home);
  };
  const crit = { id: "b", text: "has no online booking", type: "absence", explain: "" };
  const r = await R.readSite("https://acme.test/", crit, { name: "Acme Plumbing" });
  check("the About page is opened", asked.some((u) => u.endsWith("/about-us")));
  check("and its owner is named", r.result.contacts?.people?.[0]?.name === "Raj Patel", JSON.stringify(r.result.contacts?.people));
  check("but it is not given to the judge, so no model cost moves", !/Raj Patel/.test(r.text));
  check("nor counted in the absence rule's coverage, so no verdict moves", r.coverage.targeted === 1 && !r.pagesFetched.some((p) => p.endsWith("/about-us")), JSON.stringify(r.coverage));
}

/* ------------------------------------------------------- stored, shown -- */
{
  const m = readFileSync("supabase/migrations/0035_job_contacts.sql", "utf8");
  const live = readFileSync("supabase/migrations/0014_job_sites_and_leases.sql", "utf8");
  const body = (sql) => (sql.match(/create or replace function public\.record_sites[\s\S]*?\n\$\$;/) ?? [""])[0];
  const strip = (b) => b.replace(/\s+contacts\s+= r\.contacts,/, "").replace(", contacts jsonb)", ")").replace(/\s+/g, " ");
  check("0035 stores contacts", /add column if not exists contacts jsonb/.test(m) && /contacts\s+= r\.contacts/.test(m));
  check("and changes nothing else in the live record_sites", strip(body(m)) === body(live).replace(/\s+/g, " "));
  const page = readFileSync("src/app/app/reads/[id]/page.tsx", "utf8");
  check("the jobs screen reads them instead of an empty map", /rows\.filter\(\(r\) => r\.contacts\)/.test(page) && !/contacts: \{\} as Contacts/.test(page));
  const leads = readFileSync("src/lib/leads.ts", "utf8");
  check("a locked row carries no name", /locked: true,\s+has,\s+person: null,/.test(leads));
}

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
