/**
 * What a judged business is, what a stranger may see of it, and what a credit
 * buys (PRD v2 — decisions of 2026-10-15).
 *
 * ## The shape the owner asked for
 *
 * In their words: *"hide the name of the business and contact details … see if
 * it's a match or not, and by what percentage. Give the user the option to
 * actually decide if they want to take it or leave it, even if it's a maybe."*
 *
 * So every judged row is shown — fit, how many of the user's own rules it meets,
 * whether there is a phone and an email — and **a credit discloses the
 * identity**. That is a real change to what money buys: it used to buy a row we
 * had already decided was a match. Now we decide, show our working with the
 * name withheld, and the customer decides. Two things follow that are better
 * rather than merely different:
 *
 * - **Maybe becomes sellable.** It used to be a row nobody saw. A seller who
 *   knows their own market can take the risk on one, which is a judgement we
 *   were making for them and should not have been.
 * - **We never bill for a judgement nobody asked for.** The charge is attached
 *   to an action the customer took, not to a verdict we reached on our own.
 *
 * `unlock.ts` was already most of the way here and says so in as many words: a
 * locked row *"keeps everything that is true of the market and identifies
 * nobody"*. What it lacked was Maybe, and a strength signal worth deciding on.
 *
 * ## Strength is a count, not a percentage, and that is the one interpretation
 *
 * The owner asked for "by what percentage". PRD v2 says, two paragraphs later,
 * that fit is *"a label, never a number"*, and they also said "stick to prd".
 * **"Meets 3 of your 4 rules"** is the honest form of the ask: it is a real
 * ratio of things we actually checked, it names what it is a fraction of, and
 * it cannot be read as a confidence score the engine does not have. `strength`
 * returns the two integers, so a component can render "75%" instead if that is
 * what is wanted — the data is the same, the claim is not.
 *
 * ## A blind row carries no verbatim quote
 *
 * `unlock.ts` has dropped `proof` from locked rows since P0.4 for a reason that
 * survives this redesign: *a sentence lifted off their own site hands over a
 * search string that finds the business in one query*, which is the same leak
 * as printing the domain. Review prose makes that worse, not better.
 *
 * So a `Judgement` carries **two** sentences. `why` is generalised and safe to
 * show before payment; `evidence` is verbatim and travels with the reveal.
 * Designed as two fields rather than one stripped on the way out, because a
 * field that must be sanitised eventually ships unsanitised.
 *
 * ## Unreadable is not "no"
 *
 * PRD v2's labels are Strong, Maybe and No, with no "couldn't tell". This
 * repository's hardest rule is that missing evidence is never "no", and that is
 * not a corner case here: **20 of the 48 reads in production came back with
 * zero pages**. Mapping those onto No would assert a negative about two
 * businesses in five on no evidence at all.
 *
 * The resolution the owner agreed: a business we could not settle is **not
 * shown and never billed**, and the pool count carries how many. The honesty
 * rule survives, the PRD's three-label screen survives, and the cost lands on
 * a number that is checkable rather than on a verdict that is not.
 */

/** The fit label. `unreadable` never reaches a screen — see `shown`. */
export type Fit = "strong" | "maybe" | "no" | "unreadable";

/** Which source can settle a rule. From PRD v2's "how it works under the hood". */
export type RuleSource = "listing" | "website" | "reviews";

export interface Rule {
  id: string;
  /** The rule as a plain sentence, as the intake produced it. */
  text: string;
  source: RuleSource;
  /**
   * A must-have narrows the list; a nice-to-have is reported and never
   * excludes. The owner chose this over weighted scores on 2026-10-08, and
   * PRD v2 did not revisit it.
   */
  must?: boolean;
}

export interface RuleOutcome {
  ruleId: string;
  /** `true` passed, `false` failed, `null` could not be settled. */
  passed: boolean | null;
  /** The engine's own note. Internal; never rendered. */
  note?: string;
}

export interface Judgement {
  businessId: string;
  outcomes: RuleOutcome[];
  /** Generalised. Safe to show with the identity withheld. */
  why: string | null;
  /** Verbatim, off their site or a review. Travels with the reveal only. */
  evidence: string | null;
  /** How many of their pages we actually opened. 0 is the 42% case. */
  pagesRead: number;
}

/** What we found to reach them with. `contacts.ts` produces this. */
export interface Reach {
  phone: string | null;
  email: string | null;
}

/* ------------------------------------------------------------- the label -- */

const settledOf = (outcomes: RuleOutcome[]) =>
  outcomes.filter((o) => o.passed !== null);

/**
 * The fit label, from the rule outcomes alone.
 *
 * **The model proposes a label and this decides it.** PRD v2 has the judge
 * return Strong / Maybe / No, and it should — the sentence it writes is worth
 * having. But a label is a claim about the rules, and the rules have outcomes
 * we recorded, so a label that contradicts them is not a judgement call, it is
 * a bug we would be charging for. `reconcile` is where the two meet.
 */
export function fitFrom(
  rules: Rule[],
  outcomes: RuleOutcome[],
  pagesRead: number,
): Fit {
  const byId = new Map(outcomes.map((o) => [o.ruleId, o]));
  const needsReading = rules.some((r) => r.source !== "listing");

  // Nothing of theirs opened, and at least one rule needed their site or their
  // reviews. We know nothing, so we say nothing — never "no".
  if (pagesRead === 0 && needsReading) return "unreadable";

  // No rules at all is the basic lane: a trade in an area, taken as it comes.
  // What makes such a row worth paying for is that it is reachable, which the
  // caller checks — here it is simply not a "no", because nothing was asked.
  if (rules.length === 0) return pagesRead > 0 ? "strong" : "unreadable";

  const musts = rules.filter((r) => r.must);
  const outcomeFor = (r: Rule) => byId.get(r.id)?.passed ?? null;

  // A must-have we positively disproved. The only honest "no".
  //
  // A failed *nice-to-have* is deliberately not a "no": a nice-to-have is
  // reported and never excludes, which is what the owner chose on 2026-10-08.
  // It lands below as the difference between Strong and Maybe instead.
  if (musts.some((r) => outcomeFor(r) === false)) return "no";

  // We read their pages and settled none of the rules. "Maybe" here would be a
  // guess wearing a label, so it joins the unreadable pile: not shown, not
  // billed. Distinct from zero pages above only in `withheld`.
  if (settledOf(outcomes).length === 0) return "unreadable";

  if (musts.length) {
    // Strong means every must-have is settled and passed. An unsettled
    // must-have is the difference between Strong and Maybe, which is exactly
    // the uncertainty the customer is being asked to price.
    return musts.every((r) => outcomeFor(r) === true) ? "strong" : "maybe";
  }

  // No must-haves: strong when everything we settled passed.
  return settledOf(outcomes).every((o) => o.passed === true) ? "strong" : "maybe";
}

/**
 * The label we show, given what the model said and what the outcomes support.
 *
 * The outcomes win. A model that returns "strong" for a business whose required
 * rule we watched fail is not offering a second opinion, and the row would be
 * one a customer paid for on our mistake. The model's label is kept only when
 * it is *more* cautious than the outcomes allow — it read the page and we did
 * not, so it may know something the booleans lost.
 */
export function reconcile(
  proposed: Fit | null,
  rules: Rule[],
  outcomes: RuleOutcome[],
  pagesRead: number,
): Fit {
  const settled = fitFrom(rules, outcomes, pagesRead);
  if (!proposed || proposed === settled) return settled;
  if (settled === "unreadable") return settled; // nothing to be confident about
  const rank: Record<Fit, number> = { unreadable: 0, no: 1, maybe: 2, strong: 3 };
  return rank[proposed] < rank[settled] ? proposed : settled;
}

/* ---------------------------------------------------------- the strength -- */

/**
 * "Meets 3 of your 4 rules" — the two integers behind that sentence.
 *
 * `of` counts the rules we **settled**, not the rules asked, because a
 * denominator that includes what we could not check reads as a failure we
 * cannot support. `asked` is carried alongside so a caller can say "and 1 we
 * could not check" rather than quietly shrinking the question.
 */
export function strength(rules: Rule[], outcomes: RuleOutcome[]) {
  const settled = settledOf(outcomes);
  return {
    met: settled.filter((o) => o.passed === true).length,
    of: settled.length,
    asked: rules.length,
    unchecked: rules.length - settled.length,
  };
}

export function strengthLabel(rules: Rule[], outcomes: RuleOutcome[]): string {
  const s = strength(rules, outcomes);
  if (s.of === 0) return "nothing we could check";
  const core = `meets ${s.met} of your ${s.of}`;
  return s.unchecked > 0 ? `${core}, ${s.unchecked} we could not check` : core;
}

/* -------------------------------------------------- shown, and billable -- */

export const shown = (fit: Fit): boolean => fit !== "unreadable";

export const reachable = (r: Reach): boolean => Boolean(r.phone || r.email);

/**
 * May a credit be spent to reveal this row?
 *
 * Three conditions, and each one is a way of refusing money:
 *
 * - **It has to be shown.** Billing for a row we never settled is billing for
 *   our own failure to read a website.
 * - **Strong or Maybe, never No.** Maybe is deliberate and is the owner's
 *   decision: *"even if it's a maybe"*.
 * - **It has to be reachable.** PRD v2's own measure says a fit you cannot
 *   reach is useless, so a business with neither a phone nor an email is still
 *   displayed — the judgement is real and may be worth knowing — and cannot be
 *   charged for. Revealing a name we cannot help them contact is not a product.
 */
export function billable(fit: Fit, reach: Reach): boolean {
  return shown(fit) && (fit === "strong" || fit === "maybe") && reachable(reach);
}

/** Why a row cannot be paid for, in the customer's language, or null. */
export function withheld(
  fit: Fit,
  reach: Reach,
  pagesRead: number,
): string | null {
  if (fit === "unreadable") {
    return pagesRead === 0
      ? "we could not open their website, so we have not judged them"
      : "we opened their site but it did not settle any of your rules";
  }
  if (fit === "no") return "this one does not fit what you asked for";
  if (!reachable(reach)) return "no phone or email on their site, so there is nobody to call";
  return null;
}

/* --------------------------------------------------------- the blind row -- */

/** What a business looks like before anybody has paid for it. */
export interface BlindRow {
  businessId: string;
  fit: Fit;
  /** "meets 3 of your 4" — never a confected percentage. */
  strength: string;
  met: number;
  of: number;
  /** Generalised; carries no quote and no identifying string. */
  why: string | null;
  /** True of the market, identifies nobody. */
  cat: string;
  town: string;
  hasPhone: boolean;
  hasEmail: boolean;
  pagesRead: number;
  billable: boolean;
  withheld: string | null;
}

/**
 * The blind projection. Everything true of the business, nothing that names it.
 *
 * What is deliberately kept: category and town, because "Hair salon, East
 * Austin" is true of several hundred businesses and identifies none of them,
 * and without it the row is too abstract to decide on. What is deliberately
 * dropped: name, domain, phone and email digits, the Maps link, and
 * `evidence` — the last because it is a verbatim quote, and a quote is a
 * search string.
 *
 * Built by **construction rather than deletion**: the returned object lists its
 * fields, so a new identifying field on the source cannot leak by being
 * forgotten here. A `delete row.name` version of this function leaks the first
 * time somebody adds `ownerName`.
 */
export function blindRow(
  j: Judgement,
  listing: { cat: string; town: string },
  rules: Rule[],
  reach: Reach,
  proposed: Fit | null = null,
): BlindRow {
  const fit = reconcile(proposed, rules, j.outcomes, j.pagesRead);
  const s = strength(rules, j.outcomes);
  return {
    businessId: j.businessId,
    fit,
    strength: strengthLabel(rules, j.outcomes),
    met: s.met,
    of: s.of,
    why: j.why,
    cat: listing.cat,
    town: listing.town,
    hasPhone: Boolean(reach.phone),
    hasEmail: Boolean(reach.email),
    pagesRead: j.pagesRead,
    billable: billable(fit, reach),
    withheld: withheld(fit, reach, j.pagesRead),
  };
}

/* ------------------------------------------------------------- the opener -- */

/**
 * Which opener this business can have, from what we found to reach them with.
 *
 * The owner closed the old "do we charge for a match with no drafted email"
 * question by removing its premise: *"when email ID not available, what's the
 * point of generating email? And it should be optional too. Generate icebreaker
 * should be the point for ones with only phone."*
 *
 * So drafting is **a button, not part of the read**. It cannot gate a charge,
 * cannot delay a row, and cannot fail a job. The "Why them" line is always
 * there and is the opener PRD v2 asks for; this only decides what a longer
 * draft would be if the customer presses for one.
 */
export type OpenerKind = "email" | "call" | "none";

export const openerFor = (reach: Reach): OpenerKind =>
  reach.email ? "email" : reach.phone ? "call" : "none";

export function openerLabel(kind: OpenerKind): string {
  if (kind === "email") return "Draft an email";
  if (kind === "call") return "Write a call opener";
  return "No phone or email to reach them on";
}
