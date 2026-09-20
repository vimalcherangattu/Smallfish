/** Outreach note, icebreaker and likely pain point, derived from evidence only.
 *
 *  The product's whole claim is that a row can be defended. An outreach line is
 *  where that claim gets tested hardest, because a plausible-sounding opener is
 *  the easiest thing in the world to generate and the most expensive thing to
 *  be wrong about — the user pastes it into an email addressed to a real
 *  business. So this module has one rule, and it is stricter than it looks:
 *
 *      Every clause must trace to something the probe recorded, and the
 *      evidence travels with the text in `basis`.
 *
 *  Which means it refuses far more often than a generator would. No note is
 *  written for a site that was not read, for a business with no matched
 *  criterion, or for a gap the catalogue has no consequence for. `withheld`
 *  says which, because "we couldn't write this and here is why" is the same
 *  honesty the verdicts already carry — it is the couldn't-tell answer applied
 *  to outreach.
 *
 *  No model runs here. When one does, it should *rewrite* these sentences, not
 *  invent new claims: the claims are the part that has to stay checkable.
 */

import { signalForCriterion } from "@/lib/signals";
import type { Business, Criterion, ReadResult } from "@/lib/types";

export interface Outreach {
  /** What the observed gap plausibly costs the business. Marked "likely" in
   *  the UI: we observed the gap, not its effect. */
  painPoint: string | null;
  /** An opening line that cites something specific and checkable. */
  icebreaker: string | null;
  /** A short note, ready to paste and then edit. */
  note: string | null;
  /** One line per piece of evidence the text rests on. */
  basis: string[];
  /** Why there is no note, when there is none. */
  withheld: string | null;
}

const NONE = (withheld: string): Outreach => ({
  painPoint: null,
  icebreaker: null,
  note: null,
  basis: [],
  withheld,
});

/** The bare domain, which is what a recipient recognises. */
export function domainOf(site: string | null): string | null {
  if (!site) return null;
  return site.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") || null;
}

/** Things the probe positively saw, phrased as evidence lines. */
function observed(r: ReadResult): string[] {
  const lines = [`${r.pages} page${r.pages === 1 ? "" : "s"} of the site were read`];
  if (r.cms.length) lines.push(`built on ${r.cms.join(", ")}`);
  if (r.vendors.length) lines.push(`booking software detected: ${r.vendors.join(", ")}`);
  if (r.chat) lines.push("a chat widget is on the site");
  if (r.quote) lines.push("a quote or estimate route is on the site");
  return lines;
}

export function outreachFor(b: Business, criteria: Criterion[]): Outreach {
  // 1. Nothing was read, so there is nothing to write from. This is the
  //    absence-proof rule pointed at outreach: missing evidence is never a
  //    licence to say something anyway.
  if (!b.read) return NONE("this business has not been read yet");
  if (b.read.outcome !== "ok" || b.read.pages === 0) {
    return NONE(
      `the site was not readable (${b.read.outcome}), so nothing was observed to write from`,
    );
  }

  const matched = criteria.filter((c) => b.verdicts[c.id]?.verdict === "match");
  if (!matched.length) {
    return NONE("no criterion matched on evidence, so an opener would have to be invented");
  }

  const basis = observed(b.read);
  const domain = domainOf(b.site);
  const where = domain ?? "the site";

  // 2. The gap. Absence matches are what an outreach note is usually about:
  //    the thing the seller fixes is the thing that is missing.
  const gaps = matched
    .filter((c) => c.type === "absence")
    .map((c) => ({ c, s: signalForCriterion(c.text) }));
  const haves = matched
    .filter((c) => c.type === "presence")
    .map((c) => ({ c, v: b.verdicts[c.id] }));

  const lead = gaps.find((g) => g.s?.provable) ?? gaps[0];

  let icebreaker: string | null = null;
  let painPoint: string | null = null;

  if (lead) {
    const label = lead.s?.label ?? lead.c.text.replace(/^has no /, "").replace(/^is not /, "");
    icebreaker =
      `I read ${b.read.pages} page${b.read.pages === 1 ? "" : "s"} of ${where} ` +
      `and could not find ${label} anywhere on them.`;
    basis.push(
      `criterion "${lead.c.text}" matched — ` +
        (b.verdicts[lead.c.id]?.proof ?? b.verdicts[lead.c.id]?.reason ?? "no signal found"),
    );
    // Only a catalogued signal carries a consequence. An uncatalogued gap gets
    // stated and left alone rather than given an invented cost.
    painPoint = lead.s?.costsWhenMissing
      ? `If that is right, ${lead.s.costsWhenMissing}.`
      : null;
  }

  // 3. A presence match is the better opener when there is one, because it
  //    leads with what the business does rather than what it lacks — but only
  //    when the proof is there to quote.
  const have = haves.find((h) => h.v?.proof);
  if (have) {
    icebreaker = `I saw on ${where} that your ${have.c.text} — ${have.v!.proof}.`;
    basis.push(`criterion "${have.c.text}" matched — ${have.v!.proof}`);
  }

  if (!icebreaker) {
    return NONE("nothing specific enough to open with was observed");
  }

  // 4. A second observed fact, when there is one worth mentioning. Only facts
  //    the probe recorded; no flattery, because we cannot see anything to
  //    flatter.
  let aside = "";
  if (lead?.s?.id === "booking" && b.read.chat) {
    aside = " You already run chat, so the appetite for digital intake is there.";
  } else if (lead && b.phone) {
    aside = " The pages point to the phone number instead.";
    basis.push(`a phone number is listed: ${b.phone}`);
  }

  // The closing hedge names the thing we looked for, so a recipient can correct
  // a specific claim rather than a vague one. A detector that errs toward
  // firing will be wrong sometimes, and the note should invite the correction.
  const missed = lead?.s?.label ?? lead?.c.text ?? "something";
  const note = [
    icebreaker + aside,
    painPoint,
    `Happy to be wrong — if there is ${missed} I missed, say so and I will drop it.`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    painPoint,
    icebreaker,
    note,
    basis: [...new Set(basis)],
    withheld: null,
  };
}
