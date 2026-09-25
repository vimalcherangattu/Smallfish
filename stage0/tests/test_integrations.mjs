/**
 * What may be pushed to a CRM or a sender, and what may not (S2-02).
 *
 *     node stage0/tests/test_integrations.mjs
 *
 * A CSV is read by a person before anything happens to it. A push is not: the
 * rows land in a tool that may put them in front of a stranger within the hour.
 * So the checks here are about the three ways that goes wrong, and each of them
 * has happened to somebody's product before it happened to a test.
 *
 *   1. **A row leaves that was not paid for, or that asked to be left out.**
 *      One gate answers this for the file and the push alike — if they ever
 *      disagree, the newer surface is the hole.
 *   2. **A refusal becomes an email.** `outreach.ts` writes "not written: the
 *      site was not readable" and the CSV puts that in its own column, where a
 *      human reads it. The same string in a merge variable is the opening line
 *      of a message to a real business.
 *   3. **The evidence does not survive the trip.** A company in a CRM with no
 *      reason attached is a row the customer cannot defend, which is the whole
 *      thing this product exists not to ship.
 *
 * The credential and signature checks at the end are ordinary crypto hygiene,
 * and they are here because the failure is silent: a webhook nobody verifies
 * and a token stored in the clear both work perfectly until the day they matter.
 */

import { rmSync } from "node:fs";
import { compileLib } from "./_tsmodules.mjs";

process.env.INTEGRATION_SECRET_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const { dir, load } = compileLib(
  [
    "src/lib/billing.ts",
    "src/lib/csv.ts",
    "src/lib/deliver.ts",
    "src/lib/entitlement.ts",
    "src/lib/integrations.ts",
    "src/lib/outreach.ts",
    "src/lib/signals.ts",
    "src/lib/types.ts",
  ],
  "sfint-",
);

const I = await load("integrations");
const D = await load("deliver");

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  pass  ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ": " + detail : ""}`);
  }
};

// ---------------------------------------------------------------- fixtures --

const criteria = [
  {
    id: "no_booking",
    type: "absence",
    text: "does not take bookings online",
    explain: "Booking-relevant pages were read and no booking route was found.",
    needsModel: false,
  },
];

const read = (over = {}) => ({
  outcome: "ok",
  pages: 3,
  chars: 9000,
  booking: false,
  vendors: [],
  quote: false,
  chat: false,
  cms: ["WordPress"],
  ...over,
});

const business = (over = {}) => ({
  id: "b1",
  name: "Maplewick Family Dental",
  cat: "dentist",
  lat: 33.4,
  lon: -112,
  addr: "1 Main St, Phoenix, AZ",
  site: "https://maplewickdental.com",
  phone: "+1 602 555 0100",
  primary: true,
  read: read(),
  verdicts: {
    no_booking: {
      verdict: "match",
      reason: "no booking route found",
      proof: "3 relevant pages read; no sign of it",
    },
  },
  ...over,
});

// A match whose site could not be read, so `outreach.ts` refuses to write an
// opener. This is the row that must never reach a sending tool.
const unreadableMatch = business({
  id: "b2",
  name: "Cactus Dental",
  site: "https://cactusdental.example",
  read: read({ outcome: "blocked", pages: 0 }),
});

// --------------------------------------------- the gate, shared with the CSV --

{
  const { rows, refused } = I.toPushRows(
    [business(), business({ id: "b3", name: "Not A Match", verdicts: { no_booking: { verdict: "no_match", reason: "has booking" } } })],
    criteria,
  );
  check("a non-match never becomes a push row", rows.length === 1 && rows[0].businessId === "b1");
  check(
    "and the refusal says why, in the same words the file uses",
    refused.length === 1 && refused[0].code === "not_matched",
    JSON.stringify(refused),
  );
}

{
  const { rows, refused } = I.toPushRows([business()], criteria, {
    ent: { suppressed: new Set(["b1"]) },
  });
  check(
    "a business that asked to be left out is not pushed",
    rows.length === 0 && refused[0]?.code === "suppressed",
    JSON.stringify(refused),
  );
}

{
  // Two listings, one domain — `billing.ts` already treats this as one
  // business. Twenty-three near-identical companies is a mess the customer
  // cleans up by hand.
  const { rows } = I.toPushRows(
    [business(), business({ id: "b1b", name: "Maplewick Family Dental — North", site: "https://maplewickdental.com/north" })],
    criteria,
  );
  check(
    "branches on one domain are one record, and it says how many",
    rows.length === 1 && rows[0].locations === 2,
    JSON.stringify(rows.map((r) => [r.businessId, r.locations])),
  );
}

// ------------------------------------------------- what each destination takes --

const { rows: base } = I.toPushRows([business()], criteria);
const { rows: withEmail } = I.toPushRows([business()], criteria, {
  emails: { b1: "front@maplewickdental.com" },
});
const { rows: noOpener } = I.toPushRows([unreadableMatch], criteria, {
  emails: { b2: "hi@cactusdental.example" },
});

for (const kind of ["instantly", "smartlead"]) {
  const { ready, refused } = I.prepare(kind, base);
  check(
    `${kind} refuses a row we have no email address for`,
    ready.length === 0 && refused[0]?.code === "no_email",
    JSON.stringify(refused),
  );
  check(
    `and the reason says we will not guess one`,
    /guess/.test(refused[0]?.reason ?? ""),
    refused[0]?.reason,
  );

  const withOpener = I.prepare(kind, withEmail);
  check(`${kind} takes a row that has an address and an opener`, withOpener.ready.length === 1);

  const refusedOpener = I.prepare(kind, noOpener);
  check(
    `${kind} refuses a match whose opener could not be written from evidence`,
    refusedOpener.ready.length === 0 &&
      refusedOpener.refused[0]?.code === "no_defensible_opener",
    JSON.stringify(refusedOpener.refused),
  );
}

{
  // The same row a sender refuses is fine in a CRM, where nothing auto-sends
  // and a person reads the record before acting on it.
  const { rows } = I.toPushRows([unreadableMatch], criteria);
  const { ready } = I.prepare("hubspot", rows);
  check(
    "HubSpot takes that same row, because nothing there sends on its own",
    ready.length === 1,
  );
  const body = I.hubspotUpsertBody(ready);
  check(
    "and the record carries the reason no opener was written, not a blank field",
    /No opener written:/.test(body.inputs[0].properties.smallfish_icebreaker),
    body.inputs[0].properties.smallfish_icebreaker,
  );
}

{
  const { rows } = I.toPushRows(
    [business({ id: "b4", site: null, name: "No Website Dental" })],
    criteria,
  );
  const { ready, refused } = I.prepare("hubspot", rows);
  check(
    "HubSpot refuses a business with no website",
    ready.length === 0 && refused[0]?.code === "no_domain",
    JSON.stringify(refused),
  );
}

// --------------------------------------- a refusal must never become an email --

{
  const senderPayloads = [
    I.instantlyBodies(I.prepare("instantly", withEmail).ready, "camp_1"),
    I.smartleadBody(I.prepare("smartlead", withEmail).ready),
  ];
  let threw = false;
  for (const p of senderPayloads) {
    try {
      I.assertNoRefusalText(p);
    } catch {
      threw = true;
    }
  }
  check("no sender payload built from allowed rows contains refusal text", !threw);

  // And the guard actually fires — a check that never fails is not a check.
  let caught = false;
  try {
    I.assertNoRefusalText({ sf_icebreaker: "not written: the site was not readable" });
  } catch {
    caught = true;
  }
  check("and the guard fires on text that reads like a refusal", caught);
}

// ------------------------------------------------------------- the evidence --

{
  const { ready } = I.prepare("hubspot", base);
  const props = I.hubspotUpsertBody(ready).inputs[0].properties;
  check(
    "every pushed company carries the sentence that proves it",
    props.smallfish_evidence.includes("3 relevant pages read"),
    props.smallfish_evidence,
  );
  check(
    "and how the check was made",
    props.smallfish_how_checked.includes("Booking-relevant pages were read"),
  );
  check(
    "keyed on our own id, never on the domain",
    ready.length === 1 &&
      I.hubspotUpsertBody(ready).inputs[0].idProperty === "smallfish_business_id",
    "keying on domain would merge a chain's branches into one company",
  );
  check(
    "a portal missing the properties is a refusal, not a silent drop",
    I.missingProperties([]).length === I.HUBSPOT_PROPERTIES.length &&
      I.missingProperties(I.HUBSPOT_PROPERTIES.map((p) => p.name)).length === 0,
  );
}

{
  const body = I.webhookBody({
    marketId: "dental-phoenix",
    criteria,
    rows: base,
    refused: [
      { businessId: "x1", code: "not_matched", reason: "Not a match on the evidence." },
      { businessId: "x2", code: "not_matched", reason: "Not a match on the evidence." },
    ],
    sentAt: "2026-09-25T00:00:00.000Z",
  });
  const asText = JSON.stringify(body);
  check(
    "a webhook reports refusals as counts",
    body.refused.length === 1 && body.refused[0].count === 2,
    asText,
  );
  check(
    "and never names a business it refused",
    !asText.includes("x1") && !asText.includes("x2"),
    "otherwise an impossible criterion is a way to take a market's contact list",
  );
  check("the body is versioned, so a renamed field fails loudly", body.version === 1);
}

// ------------------------------------------------------ endpoints and secrets --

for (const bad of [
  "http://example.com/hook",
  "https://localhost/hook",
  "https://127.0.0.1/hook",
  "https://169.254.169.254/latest/meta-data/",
  "https://metadata.google.internal/x",
  "https://printer.local/hook",
  "https://db.internal/hook",
  "file:///etc/passwd",
  "not a url",
]) {
  check(`a webhook may not point at ${bad}`, D.safeEndpoint(bad) === null);
}
check("a real https endpoint is accepted", D.safeEndpoint("https://hooks.example.com/sf") !== null);

{
  const token = "pat-na1-0000-1111-2222-abcdefgh";
  const sealed = D.sealSecret(token);
  check("a stored credential is not the credential", !sealed.includes(token));
  check("it is versioned, so it can be re-encrypted later", sealed.startsWith("v1."));
  check("and it round-trips", D.openSecret(sealed) === token);

  let tamperFailed = false;
  try {
    const [v, iv, tag, body] = sealed.split(".");
    D.openSecret([v, iv, tag, body.slice(0, -2) + "AA"].join("."));
  } catch {
    tamperFailed = true;
  }
  check("altered ciphertext is rejected rather than decrypted to nonsense", tamperFailed);

  check(
    "the hint shows the last four characters and nothing more",
    D.secretHint(token) === "••••efgh",
    D.secretHint(token),
  );
}

{
  const secret = "whsec_test";
  const body = JSON.stringify({ rows: [] });
  const now = 1_700_000_000;
  const header = D.signWebhook(secret, body, now);

  check("a customer can verify what we sent", D.verifyWebhook(secret, body, header, now));
  check(
    "a changed body fails verification",
    !D.verifyWebhook(secret, body + " ", header, now),
  );
  check("a different secret fails", !D.verifyWebhook("other", body, header, now));
  check(
    "and a delivery captured an hour ago cannot be replayed",
    !D.verifyWebhook(secret, body, header, now + 3600),
    "the timestamp is inside the signed string, which is the part people leave out",
  );
}

// ----------------------------------------------------------- what we say after --

{
  const line = I.pushSummary({
    destination: I.DESTINATIONS.instantly,
    sent: 4,
    refused: [
      { businessId: "a", code: "no_email", reason: "no address" },
      { businessId: "b", code: "no_email", reason: "no address" },
    ],
  });
  check(
    "the summary reports what did not go, not only what did",
    line.includes("4 rows sent") && line.includes("2 not sent") && line.includes("no address"),
    line,
  );
}

rmSync(dir, { recursive: true, force: true });
console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
