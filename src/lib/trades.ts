/**
 * Turning "plumbers" into the Overture categories a search will actually scan.
 *
 * ## The problem this is the whole of
 *
 * `query.ts` already refuses to have a list of supported niches — it splits the
 * sentence and hands back whatever was typed, because "not recognised" for the
 * word *carpenters* reads as "this product does not do carpenters". That was
 * right, and it left the hard half unanswered: the candidate data is organised
 * by a fixed taxonomy of **1,817 categories**, and somebody typing "plumbers"
 * has to end up at `plumbing` or there is nothing to read.
 *
 * So this is the one place in the product that maps free text onto that
 * taxonomy. It is lexical, not a model: no key is needed, it costs nothing, it
 * is the same answer every time, and `stage0/tests/test_trades.mjs` can hold it.
 *
 * ## It shows its work, and that is not a nicety
 *
 * A search for "dentists" scans four categories. A search for "spas" could
 * reasonably mean `medical_spa` or `day_spa`, and the measured difference
 * between them is large enough to have been written into the fixtures: a nail
 * salon and a float tank are not med spas, and including them ran the
 * couldn't-tell rate from 39% to 75%. Nobody can be expected to know that.
 *
 * What this module can do is return the group it chose **and** the near misses,
 * so the screen names both and the person can move one. A silent category
 * choice is a silent wrong list.
 *
 * ## Why suppliers are excluded
 *
 * `dental_supply_store` stem-matches "dentist" and is not a dentist — it sells
 * to them. Reading it costs a crawl and puts a wholesaler in a list of
 * practices. `SELLS_TO_THE_TRADE` is the exclusion, applied to the head noun
 * only, and it is a judgment call recorded here rather than buried: the cost of
 * being wrong is a missed category, which the near-miss list still shows.
 */

/** One row of the shipped taxonomy, generated from the Overture release by
 *  `stage0/src/coverage/export_trades.py`. */
export interface Category {
  id: string;
  /** US listings in this category. */
  n: number;
  /** Of those, how many carry a website — the ones we could read. */
  site: number;
}

export interface Taxonomy {
  release: string;
  categories: Category[];
}

export interface Group {
  /** The Overture categories a read would scan, tightest first. */
  categories: string[];
  /** The category the match was anchored on. */
  anchor: string;
  /** Said back to the person: "dentists". */
  typed: string;
  /** How the match was made, for the test and for the screen's confidence. */
  how: "exact" | "synonym" | "stem";
  /** US listings across `categories`, and how many have a website. */
  n: number;
  site: number;
}

export interface Match {
  /** Null when nothing in the taxonomy came close. */
  best: Group | null;
  /** Other readings of the same words, largest first. Offered, never merged. */
  near: Group[];
}

/**
 * Words people type that the taxonomy spells differently.
 *
 * Only entries where lexical matching genuinely fails. "plumbers" needs no
 * help — its stem finds `plumbing` — and every line here is one that returned
 * nothing when tried against the real 1,817 categories.
 */
const SYNONYM: Record<string, string> = {
  vet: "veterinarian",
  vets: "veterinarian",
  physio: "physical_therapy",
  physios: "physical_therapy",
  physiotherapist: "physical_therapy",
  physiotherapists: "physical_therapy",
  gp: "doctor",
  gps: "doctor",
  realtor: "real_estate_agent",
  realtors: "real_estate_agent",
  cpa: "accountant",
  cpas: "accountant",
  attorney: "lawyer",
  attorneys: "lawyer",
  solicitor: "lawyer",
  solicitors: "lawyer",
  "aircon": "hvac_services",
  "air conditioning": "hvac_services",
  "heating and cooling": "hvac_services",
  "heating": "hvac_services",
  "estate agent": "real_estate_agent",
  "estate agents": "real_estate_agent",
  "car repair": "automotive_repair",
  "auto shop": "automotive_repair",
  "auto shops": "automotive_repair",
  "body shop": "automotive_repair",
  "body shops": "automotive_repair",
  "removals": "mover",
  "movers": "mover",
  "handyman": "contractor",
  "handymen": "contractor",
  "builder": "contractor",
  "builders": "contractor",
  "gyms": "gym",
  "pt": "fitness_trainer",
  "personal trainer": "fitness_trainer",
  "personal trainers": "fitness_trainer",
  // "law" agrees with "lawyer" on only 3 of 6 characters, below `AGREE`, so
  // "law firm" reaches every `*_law` practice area and not the firms. Measured,
  // not guessed: it came back `personal_injury_law`.
  "law firm": "lawyer",
  "law firms": "lawyer",
  "law": "lawyer",
  "optician": "optometrist",
  "opticians": "optometrist",
};

/**
 * Nouns that turn a trade into the business that supplies it. A category whose
 * **last** token is one of these is not the trade itself.
 */
const SELLS_TO_THE_TRADE = new Set([
  "supplier",
  "supply",
  "store",
  "wholesaler",
  "wholesale",
  "manufacturer",
  "equipment",
  "school",
  "association",
  "museum",
  "organization",
  "union",
  "supplies",
  "distributor",
  "rental",
]);

/** Words that describe the shape of a business rather than its trade, and that
 *  carry no signal for matching. "dental practices" and "dentists" are one
 *  search. */
const FILLER = new Set([
  "business",
  "businesses",
  "company",
  "companies",
  "practice",
  "practices",
  "clinic",
  "clinics",
  "firm",
  "firms",
  "shop",
  "shops",
  "service",
  "services",
  "provider",
  "providers",
  "office",
  "offices",
  "place",
  "places",
  "local",
  "small",
  "independent",
  "owner",
  "owners",
  "operated",
  "the",
  "a",
  "an",
  "all",
  "any",
  "some",
  "my",
]);

const words = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);

/**
 * How much two words agree: the common prefix over the longer of the two.
 *
 * ## This replaced stemming, which could not be made to work
 *
 * The first version generated every trailing stem of the typed word down to
 * three characters and took the categories any of them matched. Measured
 * against the real 1,644 categories that produced, among others:
 *
 *     carpenters   → car_dealer          electricians → electronics
 *     barbers      → bar                 accountants  → accommodation
 *     florists     → flowers_and_gifts   landscapers  → landmark_and_historical
 *
 * — because a three-letter stem matches a long unrelated token, and the
 * unrelated category is often the bigger one, so it won every tie. Lengthening
 * the floor to four broke the cases the floor existed for ("spas" must reach
 * `spa`), and taking only the longest matching stem sent "landscapers" to
 * `landscape_architect`, which has 66 listings, over `landscaping`, which has
 * 51,030.
 *
 * Agreement fixes all of it with one number, because the failures were never
 * about stem length — they were about a short match on a long word. "carpenters"
 * and "carpenter" agree on 9 of 10 characters; "carpenters" and "car" agree on
 * 3 of 10.
 */
export function agreement(a: string, b: string): number {
  if (!a || !b) return 0;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return i / Math.max(a.length, b.length);
}

/**
 * How much of a word two must share to be the same word.
 *
 * Set by where the real cases fall, and the margin is genuinely narrow:
 * `roofing` against "roofers" and `dentist` against "dental" both land on
 * 0.571, and `electronics` against "electricians" lands on exactly 0.5. There
 * is nothing between them but this number, which is why it is a named constant
 * with the two measurements beside it rather than a literal in an expression.
 */
export const AGREE = 0.55;

/**
 * The same, for deciding which categories belong **together**, which has to be
 * stricter.
 *
 * At 0.55 two collisions got through, both measured against the real taxonomy:
 * `space` agrees with "spas" on 3 of 5 characters, so `venue_and_event_space`
 * and `coworking_space` joined a search for spas; and `medical` agrees with
 * `medical_spa` on 7 of 11, so `health_and_medical` — a 356,313-listing
 * catch-all — joined a search for med spas and took the group from 34,945 to
 * 391,258.
 *
 * 0.7 excludes both and still keeps the ones that matter: `dentistry` against
 * `dentist` is 0.78 and `lawyers` against `lawyer` is 0.86.
 */
export const FAMILY_AGREE = 0.7;

const tokensOf = (id: string) => id.split("_");
const lastOf = (id: string) => tokensOf(id)[tokensOf(id).length - 1];

/** Whether a category's own head noun means it supplies the trade rather than
 *  being it. */
const supplier = (id: string) => SELLS_TO_THE_TRADE.has(lastOf(id));

/** A category is a candidate when one of its tokens is the typed word, and it
 *  is not the trade's supplier. */
const joins = (id: string, word: string) =>
  !supplier(id) && tokensOf(id).some((tok) => agreement(tok, word) >= AGREE);

/** Looser, for the *narrowing* words only: "med" has to reach "medical", which
 *  agrees on 3 of 7. A narrowing word can only ever pick between candidates the
 *  head word already found, so it cannot pull in anything of its own. */
const akin = (a: string, b: string) =>
  a === b ||
  (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a)));

/**
 * The categories that go with an anchor.
 *
 * **Narrow by design.** A member has to end *with the anchor itself* — so
 * `cosmetic_dentist` and `general_dentistry` join `dentist`, and `boxing_gym`
 * joins `gym` — rather than merely share a word with it.
 *
 * This is the rule the fixtures paid for. `day_spa` and `health_spa` share the
 * word "spa" with `medical_spa` and are not med spas: including them was
 * measured at 75% couldn't-tell and 7% offering a neurotoxin, against 39% and
 * 51% for `medical_spa` alone. A rule that grouped on a shared word would have
 * made that mistake again, silently, in every vertical. So the widening is
 * **offered** as a near miss and never merged.
 */
function family(cats: Category[], anchor: Category): Category[] {
  const id = anchor.id;
  return cats.filter(
    (c) =>
      c.id === id ||
      (!supplier(c.id) &&
        (c.id.endsWith(`_${id}`) ||
          // Only for a single-word anchor. Comparing one token against a
          // multi-word id is what let `health_and_medical` into `medical_spa`:
          // its last token agrees with the *first half* of the anchor. A
          // multi-word anchor is already specific, and the only categories that
          // narrow it further are the ones that end with the whole of it.
          (tokensOf(id).length === 1 && agreement(lastOf(c.id), id) >= FAMILY_AGREE))),
  );
}

const sum = (cats: Category[], key: "n" | "site") =>
  cats.reduce((a, c) => a + c[key], 0);

function group(
  anchor: Category,
  members: Category[],
  typed: string,
  how: Group["how"],
): Group {
  // The anchor first, then by size, so the screen's first words are the
  // category the person most likely meant.
  const rest = members.filter((c) => c.id !== anchor.id).sort((a, b) => b.n - a.n);
  const all = [anchor, ...rest];
  return {
    categories: all.map((c) => c.id),
    anchor: anchor.id,
    typed,
    how,
    n: sum(all, "n"),
    site: sum(all, "site"),
  };
}

/**
 * Read a typed business type against the taxonomy.
 *
 * Never throws. An empty or unrecognised input comes back as `best: null` with
 * whatever near misses exist, which is the screen's "did you mean" — and when
 * that list is empty too, the honest answer is that we do not have a category
 * for it, which is a different sentence from "we do not cover that city".
 */
export function matchTrade(taxo: Taxonomy | null, typed: string): Match {
  const none: Match = { best: null, near: [] };
  if (!taxo?.categories?.length) return none;

  const raw = (typed ?? "").trim();
  const all = words(raw);
  if (!all.length) return none;

  const byId = new Map(taxo.categories.map((c) => [c.id, c]));

  // --- a synonym, on the whole phrase or its last word ----------------------
  const phrase = all.join(" ");
  const meaningful = all.filter((w) => !FILLER.has(w));
  const head = meaningful[meaningful.length - 1] ?? all[all.length - 1];

  for (const key of [phrase, meaningful.join(" "), head]) {
    const target = SYNONYM[key];
    const anchor = target ? byId.get(target) : undefined;
    if (anchor) {
      return { best: group(anchor, family(taxo.categories, anchor), raw, "synonym"), near: [] };
    }
  }

  // --- exact, on the whole phrase -------------------------------------------
  //
  // Only the whole phrase, or a single word. Matching the **head** alone here
  // is what sent "med spas" to `spas`: the narrowing word was thrown away by
  // the branch that fires first, and the measured difference between those two
  // readings is 39% couldn't-tell against 75%.
  const joined = meaningful.join("_");
  const exact = byId.get(joined) ?? (meaningful.length === 1 ? byId.get(head) : undefined);
  if (exact && !supplier(exact.id)) {
    return { best: group(exact, family(taxo.categories, exact), raw, "exact"), near: [] };
  }

  // --- stems ----------------------------------------------------------------
  //
  // The head noun carries the trade and the words before it narrow it. Every
  // stem of every meaningful word is tried and the results are ranked
  // **together**, because the best anchor is often reached by a shorter stem
  // than the first one that matches anything: "dental" finds
  // `dental_laboratories`, and only "dent" finds `dentist`.
  //
  // Ranking is by how many of the *other* typed words the category accounts
  // for, then by size. The head is matched by construction, so counting it
  // would score every candidate equally; the narrowing words are the whole
  // question, and they are what makes "med spas" land on `medical_spa`.
  const others = meaningful.slice(0, -1);
  const covers = (c: Category) =>
    others.filter((w) => tokensOf(c.id).some((t) => akin(t, w))).length;

  const pool = new Map<string, Category>();
  for (const w of [...meaningful].reverse()) {
    for (const c of taxo.categories) if (joins(c.id, w)) pool.set(c.id, c);
    // Stop at the first word that found anything. The head noun carries the
    // trade; the words before it only choose between what it found, which is
    // `covers`. Widening the pool with them is how "pool cleaners" would come
    // back with every swimming pool in the country.
    if (pool.size) break;
  }
  if (!pool.size) return none;

  const ranked = [...pool.values()].sort((a, b) => covers(b) - covers(a) || b.n - a.n);

  // Distinct readings, not distinct categories: once `dentist` is the best
  // answer, `cosmetic_dentist` is part of it rather than an alternative to it.
  const groups: Group[] = [];
  const claimed = new Set<string>();
  for (const c of ranked) {
    if (claimed.has(c.id)) continue;
    // Members already claimed by an earlier group come **out** of this one, not
    // just out of the running for its anchor. `medical_spa` is in the family of
    // `spas` as well as being its own anchor, so without this the near miss
    // offered beside a med spa search was "spas · 160,422 in the US" — a count
    // that includes the 34,945 we are already scanning. Picking it would have
    // widened the search and double-counted the reason to.
    const members = family(taxo.categories, c).filter(
      (m) => m.id === c.id || !claimed.has(m.id),
    );
    for (const m of members) claimed.add(m.id);
    groups.push(group(c, members, raw, "stem"));
    if (groups.length >= 4) break;
  }

  const [best, ...near] = groups;
  return { best, near: near.slice(0, 3) };
}

/** The categories named on screen, as a person would read them. */
export const pretty = (id: string) => id.replace(/_/g, " ");
