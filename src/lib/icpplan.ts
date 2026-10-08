/**
 * An ICP, taken apart into a plan somebody can argue with.
 *
 * ## What this is for
 *
 * The flow the owner specified on 2026-10-08: say what you sell (typed, or
 * lifted out of a document you upload), and get back **the plan we would
 * actually run** — every check named, said in words, marked must-have or
 * nice-to-have, each carrying how certain we can be about it and why. You move
 * things between the two buckets, drop what you do not want, add what we did
 * not think of, and *then* the read starts.
 *
 * The point is that the plan is editable before any money is spent, and that
 * nothing in it is a black box.
 *
 * ## Must-have and nice-to-have, not weights — a decision, recorded
 *
 * `docs/design-system.md` §5 records an unresolved fork: the design system
 * describes 0–100 scores, A/B/C tiers and weighted rubrics; the engine
 * implements binary verdicts with a sentence off the page as proof. CLAUDE.md
 * says not to resolve it silently, so it went to the owner and **they chose
 * must/nice with per-criterion certainty** (2026-10-08).
 *
 * That choice buys two things. A row stays defensible — every one of them is
 * "this is true of their site, here is the sentence" rather than "this scored
 * 71". And `PROJECT_PLAN.md` gate item 2 keeps measuring the thing it was built
 * to measure, the precision of a verdict; there is no equivalent measurement
 * for a score, so adopting one would have changed what Stage 0 is proving
 * halfway through proving it.
 *
 * Re-ordering still works. Priority is a field on an item, so moving a check
 * between buckets is a pure function, and the plan can be edited in the browser
 * and saved without a round trip.
 *
 * ## Certainty is a mechanism, not a number
 *
 * It would be easy, and dishonest, to print "87% confident" here. What we
 * actually know is **how** a check gets settled, and the two ways differ in a
 * way the buyer can understand:
 *
 *   - `observed` — a detector sees it in the page source. A Zocdoc script is
 *     either there or it is not. Settles with no model, and cannot come back
 *     "couldn't tell".
 *   - `read` — settled by reading the pages that would show it. Every absence
 *     criterion is this, by design: "absence needs positive proof" means the
 *     relevant pages must be read and nothing found, and when they cannot be
 *     read the answer is "couldn't tell", never "no".
 *
 * Those are the only two, because they are the only two the engine has.
 *
 * ## A plan with no must-haves is the plain-list lane
 *
 * Deliberately legal, and it is the owner's "someone basic just comes to get
 * some industry in some region and downloads it". No must-haves means no
 * criterion to settle, so nothing is read and the answer is the listings
 * themselves. `criteriaForRead` returning empty is what that looks like from
 * here, and the caller decides what it costs.
 */

import { parseSearch, MAX_CRITERIA, type Declined } from "@/lib/search";
import { SIGNALS, type ObservableSignal } from "@/lib/signals";

/** Must-have narrows the list. Nice-to-have is reported and never excludes. */
export type Priority = "must" | "nice";

/**
 * How a check gets settled, which is the only honest form of "how sure".
 * See the note at the top: these are the two the engine has.
 */
export type Certainty = "observed" | "read";

export interface PlanItem {
  signalId: string;
  /** The signal as a noun phrase, for a list. */
  label: string;
  /** The criterion, in the shape the search already produces. */
  text: string;
  type: "absence" | "presence";
  priority: Priority;
  certainty: Certainty;
  /** How the check is made, in the person's terms. */
  how: string;
  /** The question the engine puts to the site. */
  question: string;
  /** True when the offer's own words implied this, rather than us suggesting
   *  it. The screen says so, because a check somebody's own description asked
   *  for deserves different treatment from one we proposed. */
  fromOffer: boolean;
}

export interface Plan {
  /** The checks that will run, must-haves first, in the order they were implied. */
  items: PlanItem[];
  /** Named in the description and not settleable, with the reason and, where
   *  there is one, an observable thing that gets at the same question. One
   *  list, from `parseSearch`, so the refusal reads the same here as it does
   *  when the words are typed into the search box. */
  declined: Declined[];
  /** Provable checks the description did not imply, offered to add. */
  available: PlanItem[];
  /** The description named nothing a website can show. A real answer. */
  nothingObservable: boolean;
}

const certaintyOf = (s: ObservableSignal, type: PlanItem["type"]): Certainty =>
  // A detector reads the page source directly, so a *presence* it can see is
  // observed. An absence is never observed: not finding a thing is only proof
  // once the pages that would carry it have been read.
  type === "presence" && typeof s.detected === "function" ? "observed" : "read";

const itemFor = (
  s: ObservableSignal,
  type: PlanItem["type"],
  priority: Priority,
  fromOffer: boolean,
): PlanItem => ({
  signalId: s.id,
  label: s.label,
  text: type === "absence" ? s.absenceText : s.presenceText,
  type,
  priority,
  certainty: certaintyOf(s, type),
  how: s.how,
  question: s.question,
  fromOffer,
});

/**
 * Take an offer description apart.
 *
 * `description` is whatever they typed, or the text lifted out of a document
 * they uploaded — this does not care which, which is why the upload path needs
 * no second implementation.
 *
 * Everything the description implies and we can settle becomes a **must-have**:
 * they asked for it. Everything else provable is offered in `available` for
 * them to promote, so the plan has parts to move rather than being a verdict.
 */
export function planFromOffer(description: string): Plan {
  const text = (description ?? "").trim();
  const implied = SIGNALS.filter((s) => s.provable && s.inOffer.test(text));

  // An offer is usually needed where its signal is *missing* — somebody selling
  // booking software wants the practices with none — so absence is the default.
  // It is not universal: a web designer wants the sites that *are* on Wix, and
  // `offerNeeds` is how the catalogue says which way round a signal runs.
  // Before that field existed, "we rebuild outdated websites" proposed "is not
  // on a website builder", the exact opposite of the ask.
  const items = implied
    .slice(0, MAX_CRITERIA)
    .map((s) => itemFor(s, s.offerNeeds ?? "absence", "must", true));

  const taken = new Set(items.map((i) => i.signalId));
  const available = SIGNALS.filter((s) => s.provable && !taken.has(s.id)).map((s) =>
    itemFor(s, s.offerNeeds ?? "absence", "nice", false),
  );

  return {
    items,
    // One list of what we refuse, reused rather than restated: `parseSearch`
    // already scans free text for the things no website states — revenue, head
    // count, owner intent, funding — and carries the reason and the observable
    // proxy for each. A second copy here would drift, and the drift would show
    // up as the product refusing a word on one screen and accepting it on
    // another.
    declined: parseSearch(text).declined,
    available,
    nothingObservable: implied.length === 0,
  };
}

/** Move one check between must-have and nice-to-have. */
export function setPriority(plan: Plan, signalId: string, to: Priority): Plan {
  return {
    ...plan,
    items: plan.items.map((i) => (i.signalId === signalId ? { ...i, priority: to } : i)),
  };
}

/**
 * Flip a check between "they have it" and "they do not".
 *
 * Both directions are real asks: somebody selling a booking *integration*
 * wants practices that already have booking, and somebody selling booking
 * wants the ones without. Certainty moves with it, because a presence a
 * detector can see is observed and its absence never is.
 */
export function setType(plan: Plan, signalId: string, to: PlanItem["type"]): Plan {
  const apply = (i: PlanItem): PlanItem => {
    if (i.signalId !== signalId) return i;
    const s = SIGNALS.find((x) => x.id === i.signalId);
    if (!s) return i;
    return { ...i, type: to, text: to === "absence" ? s.absenceText : s.presenceText, certainty: certaintyOf(s, to) };
  };
  return { ...plan, items: plan.items.map(apply), available: plan.available.map(apply) };
}

/** Take a check out of the plan. It returns to `available`. */
export function dropItem(plan: Plan, signalId: string): Plan {
  const going = plan.items.find((i) => i.signalId === signalId);
  if (!going) return plan;
  return {
    ...plan,
    items: plan.items.filter((i) => i.signalId !== signalId),
    available: [...plan.available, { ...going, priority: "nice", fromOffer: false }],
  };
}

/** Add one of the offered checks to the plan. */
export function addItem(plan: Plan, signalId: string, priority: Priority = "nice"): Plan {
  if (plan.items.some((i) => i.signalId === signalId)) return plan;
  const coming = plan.available.find((i) => i.signalId === signalId);
  if (!coming) return plan;
  return {
    ...plan,
    items: [...plan.items, { ...coming, priority }],
    available: plan.available.filter((i) => i.signalId !== signalId),
  };
}

/**
 * The checks that actually narrow the list.
 *
 * **Must-haves only, and capped.** A nice-to-have is reported on a row and
 * never excludes it, which is the whole difference between the two buckets:
 * promoting one changes the size of the answer and demoting it does not.
 *
 * The cap is `MAX_CRITERIA`, shared with the search box rather than chosen
 * again here. Every criterion is a read of the pages that would settle it, so
 * an uncapped plan is an uncapped bill.
 *
 * Empty is a legitimate answer, not a failure — see the plain-list lane at the
 * top of this file.
 */
export function criteriaForRead(plan: Plan): PlanItem[] {
  return plan.items.filter((i) => i.priority === "must").slice(0, MAX_CRITERIA);
}

/** Checks that will be reported but never exclude a business. */
export const reportedOnly = (plan: Plan): PlanItem[] =>
  plan.items.filter((i) => i.priority === "nice");

/**
 * One line saying what this plan will do, before it does it.
 *
 * Written here rather than on the screen so the summary on the plan page, the
 * one on the confirm step and the one stored with a saved ICP cannot disagree
 * about what was about to be run.
 */
export function describePlan(plan: Plan): string {
  const must = criteriaForRead(plan);
  const nice = reportedOnly(plan);
  if (!must.length) {
    return nice.length
      ? `No must-haves, so nothing is excluded. We will list the businesses and report ${nice.length} thing${nice.length === 1 ? "" : "s"} about each.`
      : "No checks yet, so this would list the businesses without reading them.";
  }
  const head = `A business is a match when it ${must.map((m) => m.text).join(" and ")}.`;
  return nice.length
    ? `${head} We will also report ${nice.length} other thing${nice.length === 1 ? "" : "s"} without excluding anybody for them.`
    : head;
}
