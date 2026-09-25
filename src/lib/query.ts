/**
 * Splitting "carpenters in Austin that don't show pricing" into its three
 * parts (S2-10).
 *
 * ## Why this exists beside `search.ts`
 *
 * `parseSearch` resolves a query against the niches we have **measured** — four
 * of them — and reports anything else as unrecognised. That is the right
 * behaviour for the confirm screen, where the question is "can we answer this
 * today". It is the wrong behaviour for the search box, where it produced the
 * single most damaging screen in the product:
 *
 *     What    not recognised
 *
 * for the word "carpenters". Nothing about carpenters is unsupported — the
 * engine is vertical-agnostic by design, and `check_plan.py` exists precisely
 * so that a criterion in a vertical nobody anticipated still produces a working
 * plan. The parser said "not recognised" because it had no *rule* for the word,
 * and a stranger reads that as "this product does not do carpenters".
 *
 * So this module knows nothing about which niches exist. It splits on the
 * shape of the sentence and hands back whatever the person wrote. Whether we
 * have read that market yet is a different question, asked later, and answered
 * with "not yet" rather than "not recognised".
 *
 * ## It shows its work
 *
 * Whatever it decides is rendered back into three editable fields. A parser
 * that silently mis-reads "in" inside a business name — "Blinds in Motion" —
 * costs somebody a wrong search they cannot see the cause of; one that shows
 * the split lets them fix it in a second. That is P1 pointed at the input.
 */

export interface Split {
  /** The kind of business. Free text — any vertical, no list. */
  what: string;
  /** Where, as typed. `region.ts` decides what it means. */
  where: string;
  /** The one thing that decides fit, as typed. May be empty. */
  criterion: string;
}

/**
 * Words that introduce the criterion clause.
 *
 * **Only the connector is removed. The negation always survives.** The first
 * version of this treated "that don't" as one connector and cut the whole
 * thing, so "carpenters that don't show pricing" became the criterion "show
 * pricing" — the exact opposite search, returning precisely the businesses the
 * customer does not want, with nothing on screen to show it had happened.
 *
 * Worse, the test I wrote asserted that behaviour, so the suite was green on a
 * bug it was written to catch. The check below now asserts the negation is
 * present, which is a property rather than a transcription of whatever the
 * code currently does.
 */
const CRITERION_LEADS = [
  " that ",
  " who ",
  " which ",
  " with ",
  " without ",
  " missing ",
  " lacking ",
  " no ",
];

/** Connectors that carry no meaning of their own and come off the front of the
 *  criterion. Everything else — every negation among them — stays. */
const CONNECTOR = /^(that|who|which)\b\s*/i;

const tidy = (s: string) => s.replace(/\s+/g, " ").trim().replace(/^[,;]+|[,;]+$/g, "").trim();

/**
 * Split a typed query.
 *
 * Never throws and never returns null — an unparseable string comes back as
 * `what` alone, which renders into the first field and lets the person move it.
 * Refusing to parse and clearing the box is the one behaviour that loses work
 * somebody already typed.
 */
export function splitQuery(raw: string): Split {
  let s = tidy(raw ?? "");
  if (!s) return { what: "", where: "", criterion: "" };

  // Strip a leading "find me" / "I sell to" / "looking for", which people type
  // and which belongs to none of the three fields.
  s = s.replace(
    /^(find|show|get)( me)?\s+|^i (sell|am selling|want|need)( to)?\s+|^looking for\s+/i,
    "",
  );

  // --- the criterion clause -------------------------------------------------
  let criterion = "";
  let head = s;
  let best = -1;
  const lower = ` ${s.toLowerCase()} `;
  for (const lead of CRITERION_LEADS) {
    const at = lower.indexOf(lead);
    // Earliest match wins, so "in Austin that ..." cuts at "that" and not at a
    // later "with".
    if (at !== -1 && (best === -1 || at < best)) best = at;
  }
  if (best !== -1) {
    head = tidy(s.slice(0, best));
    // Take everything from the lead onwards, then remove only the connector.
    // "that don't show pricing" keeps "don't show pricing"; "with no quote
    // form" keeps all of itself.
    criterion = tidy(s.slice(best)).replace(CONNECTOR, "").trim();
  }

  // --- where ----------------------------------------------------------------
  // The **last** " in " in the head, because a business type can contain one
  // ("blinds in motion", "all in one plumbing") and the place almost always
  // comes after the type.
  let what = head;
  let where = "";
  const headLower = head.toLowerCase();
  const at = headLower.lastIndexOf(" in ");
  if (at !== -1) {
    what = tidy(head.slice(0, at));
    where = tidy(head.slice(at + 4));
  } else {
    // "Austin carpenters" and "carpenters, Austin" also happen. Only the comma
    // form is handled: guessing which word of an unpunctuated pair is the place
    // needs the place list, and this module deliberately has no data in it.
    const comma = head.lastIndexOf(",");
    if (comma !== -1) {
      what = tidy(head.slice(0, comma));
      where = tidy(head.slice(comma + 1));
    }
  }

  return { what, where, criterion };
}

/** The sentence a split reads back as, for the confirm line. */
export function describeSplit(s: Split): string {
  const bits = [s.what || "businesses"];
  if (s.where) bits.push(`in ${s.where}`);
  if (s.criterion) bits.push(`that ${s.criterion}`);
  return bits.join(" ");
}
