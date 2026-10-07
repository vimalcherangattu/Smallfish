/**
 * A spent balance is a refusal, not a delivery of nothing.
 *
 *     node stage0/tests/test_spent_balance.mjs
 *
 * ## The defect this exists for
 *
 * Three surfaces spend credits on a name, and all three answered "you can pay
 * for none of these" as though something had happened:
 *
 *   - **The download.** `/api/export` built its CSV from `charge.paid`. With a
 *     spent balance that array is empty, so the route answered 200 with a file
 *     of one header row, and the browser saved `smallfish-<market>.csv` into
 *     somebody's Downloads folder with no businesses in it. The sentence
 *     explaining why was set on the page they had just left to go and open the
 *     file.
 *   - **The push.** `/api/integrations` answered `ok: true, sent: 0`, which is
 *     honest and leaves the customer nowhere to go.
 *   - **The unlock card.** With a zero balance `afford` is zero, so the primary
 *     button on the results screen read **"Unlock 0"**, was enabled, and on
 *     press charged nothing and came back "0 of 39 are yours". The main action
 *     on the screen did nothing, at exactly the moment the customer had decided
 *     to pay us. "Add credits" was a small underlined link beside it.
 *
 * None of that was caught by the 64 files already here, because every one of
 * them exercises a workspace that can afford the rows. The condition only
 * appears after somebody has spent twenty free credits, which is to say on
 * every customer who likes the product.
 *
 * ## Partial is not this
 *
 * The distinction these assertions are really defending: eighteen of forty-two
 * rows is a **success** with a sentence attached, and the product goes out of
 * its way to support it — `chargeLeads` charges row by row and refuses one at a
 * time rather than taking offence at its own pricing. None of forty-two is a
 * different event. A guard written as "fewer than asked" would have broken the
 * partial path, which is why `spentBalance` is pure and tested rather than an
 * inline comparison in two routes.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { compileLib } from "./_tsmodules.mjs";

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

/* ------------------------------------------------------------ the decision -- */

// The real function, not a copy of it. `charging.ts` carries `server-only` and
// reaches the database, but `compileLib` strips the tripwire and nothing here
// calls the parts that connect — `spentBalance` takes an outcome and returns a
// sentence, which is exactly why it is pure.
const { load } = compileLib(
  [
    "src/lib/charging.ts",
    "src/lib/accounts.ts",
    "src/lib/ledger.ts",
    "src/lib/db.ts",
    "src/lib/pricing.ts",
    "src/lib/unlock.ts",
    "src/lib/types.ts",
    "src/lib/mail.ts",
    "src/lib/entitlement.ts",
    "src/lib/signals.ts",
    "src/lib/suppression.ts",
  ],
  "sf-spent-",
);
const { spentBalance } = await load("charging");

const row = { id: "x" };

test("paying for none of several matches is a refusal", () => {
  const r = spentBalance({ paid: [], note: "0 of 42 are yours." }, 42, "Add credits.");
  assert.ok(r, "should refuse");
  assert.equal(r.ok, false);
  assert.equal(r.addCredits, "/account");
});

test("the refusal carries the charge's own sentence, not a second voice", () => {
  const note = "0 of 42 are yours. The other 42 need 42 more credits, you have 0 left.";
  const r = spentBalance({ paid: [], note }, 42, "Add credits and the file is one press away.");
  assert.ok(r.reason.startsWith(note), `reason should open with the note, got: ${r.reason}`);
  assert.ok(r.reason.includes("one press away"));
});

test("and the closing clause is the caller's, so the push does not promise a file", () => {
  const forPush = spentBalance({ paid: [], note: "n." }, 9, "Add credits and HubSpot gets them.");
  assert.ok(!forPush.reason.includes("file"));
  assert.ok(forPush.reason.includes("HubSpot"));
});

test("a partial charge is a success, never this refusal", () => {
  // The defect a naive "fewer than asked" guard would introduce. Eighteen of
  // forty-two rows must still download as eighteen rows.
  assert.equal(spentBalance({ paid: [row], note: "n." }, 42, "x"), null);
  assert.equal(spentBalance({ paid: [row, row], note: "n." }, 3, "x"), null);
});

test("one row of one is a success", () => {
  assert.equal(spentBalance({ paid: [row], note: "n." }, 1, "x"), null);
});

test("nothing asked for is an empty request, not a spent balance", () => {
  // A market with no matches must not tell somebody to buy credits for rows
  // that do not exist.
  assert.equal(spentBalance({ paid: [], note: "n." }, 0, "x"), null);
});

/* ------------------------------------------- the surfaces that must use it -- */

const exportRoute = read("src/app/api/export/route.ts");
const pushRoute = read("src/app/api/integrations/route.ts");

test("the download refuses before it builds a file", () => {
  assert.match(exportRoute, /spentBalance\(charge, leads\.length/);
  // 402 is the accurate status: the only failure in this product that a
  // payment fixes.
  assert.match(exportRoute, /if \(spent\) return Response\.json\(spent, \{ status: 402 \}\)/);
  // And it must come before the CSV is written, or the file is built anyway.
  assert.ok(
    exportRoute.indexOf("spentBalance(charge") < exportRoute.lastIndexOf("return csvResponse({"),
    "the refusal has to be reached before csvResponse",
  );
});

test("the push refuses before it delivers", () => {
  assert.match(pushRoute, /spentBalance\(charge, matched\.length/);
  assert.ok(
    pushRoute.indexOf("spentBalance(charge") < pushRoute.indexOf("await deliver({"),
    "the refusal has to be reached before deliver",
  );
});

test("the download button can show the way to fix it", () => {
  // The route names the destination and the button renders it. Before this,
  // `signIn` was the only link the button knew how to draw, so a signed-in
  // customer with a spent balance got the sentence and no way to act on it.
  const btn = read("src/components/ExportButton.tsx");
  assert.match(btn, /addCredits\?: string/);
  assert.match(btn, /setAddCredits\(body\.addCredits \?\? null\)/);
  assert.match(btn, /Add credits/);
});

/* ------------------------------------------------------- the unlock card -- */

test("the unlock card never offers to unlock zero", () => {
  const list = read("src/components/LeadList.tsx");
  // The zero branch must return before the button that labels itself with
  // `afford`, otherwise the primary action on the screen reads "Unlock 0".
  const guard = list.indexOf("afford <= 0");
  assert.ok(guard > 0, "the zero-balance branch should exist");
  assert.ok(
    guard < list.indexOf("`Unlock ${"),
    "the zero branch has to come before the Unlock button",
  );
});

test("and at zero the one action is the one that helps", () => {
  const list = read("src/components/LeadList.tsx");
  const branch = list.slice(list.indexOf("afford <= 0"), list.indexOf("afford <= 0") + 1200);
  assert.match(branch, /href="\/account"/);
  assert.match(branch, /sf-btn-primary/);
  assert.ok(
    !/<button/.test(branch),
    "no button in the zero branch, the primary action is the link to credits",
  );
});

console.log(`\n${failures} failure(s)`);
process.exit(failures ? 1 : 0);
