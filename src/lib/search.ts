/** Parse a typed search into criteria, and decide what to say back (S1-01).
 *
 *  The product document is unusually specific about this screen, because it is
 *  where the product's honesty is cheapest to deliver and most visible. The
 *  confirm step owes the user eight different answers, and seven of them are
 *  some form of "no":
 *
 *  | Situation | What Small Fish does |
 *  |---|---|
 *  | Vague criterion ("small", "modern site", "busy") | One multiple-choice question before counting |
 *  | Criterion no website can prove ("revenue over $1M") | Refuses politely, suggests a provable proxy |
 *  | Absence criteria | Positive proof required, else couldn't tell |
 *  | Very rare criteria (<3% match rate) | Warns before unlocking |
 *  | Contradictory criteria | Flags the conflict |
 *  | Search for people, not businesses | Declined |
 *  | Sensitive criteria about owners | Declined |
 *
 *  All of that happens *before* anything is counted or charged, which is the
 *  point: a criterion the engine cannot settle is cheapest to refuse while the
 *  user is still typing.
 *
 *  **This is the cheap layer.** A model reads the query in the finished
 *  product (`S0-12`, blocked on a key). This parser recognises what it can and
 *  says so when it cannot — `unrecognised` is a first-class output, not a
 *  failure mode. Anything it does recognise, it recognises the same way twice,
 *  which is worth something a model cannot offer: the confirm step is the
 *  contract, so it should not change wording between two identical searches.
 */

import { SIGNALS, signalForCriterion, type ObservableSignal } from "@/lib/signals";
import type { MarketIndex } from "@/lib/types";

/** The product document caps a search at five criteria: "more criteria lower
 *  match rates and raise cost". */
export const MAX_CRITERIA = 5;
/** Below this share of the judged candidates, warn before unlocking. */
export const RARE_MATCH_RATE = 0.03;

export interface ParsedCriterion {
  id: string;
  type: "presence" | "absence";
  /** The criterion as it will be searched. */
  text: string;
  /** The words in the query it came from, so the user can see the mapping. */
  source: string;
  signalId: string | null;
  /** The "how this is checked" line the confirm step promises. */
  how: string;
  /** Settleable by the engine as it stands today. */
  provable: boolean;
}

export interface Declined {
  kind: "unprovable" | "people" | "sensitive";
  source: string;
  why: string;
  /** A criterion that *is* observable and gets at the same thing. */
  proxy?: { text: string; provableToday: boolean };
}

export interface Clarification {
  source: string;
  question: string;
  options: Array<{
    label: string;
    /** Choosing this adds the criterion; null means "drop the word". */
    criterion: ParsedCriterion | null;
  }>;
}

export interface Conflict {
  a: ParsedCriterion;
  b: ParsedCriterion;
  why: string;
}

export interface ParsedSearch {
  raw: string;
  where: { text: string; marketId: string | null } | null;
  what: { text: string; niche: string | null; related: string[] } | null;
  criteria: ParsedCriterion[];
  /** Ranks but does not filter — "prefer multi-location". */
  preferences: string[];
  declined: Declined[];
  clarifications: Clarification[];
  conflicts: Conflict[];
  /** Phrases the parser could not place. Said out loud, never guessed at. */
  unrecognised: string[];
  overLimit: boolean;
}

// --------------------------------------------------------------- vocabulary

/** Niches we have data for, and the related types the confirm step suggests.
 *  Related types are a suggestion, not an expansion: nothing is searched that
 *  the user did not agree to. */
const NICHES: Array<{ id: string; words: RegExp; label: string; related: string[] }> = [
  { id: "med_spa", label: "med spas",
    words: /\b(med(ical)?[ -]?spas?|aesthetics? (clinic|cent(re|er))s?|botox clinics?)\b/i,
    related: ["aesthetic clinics", "dermatology", "cosmetic surgery"] },
  { id: "dental", label: "dental practices",
    words: /\b(dental|dentists?|orthodont\w*|endodont\w*)\b/i,
    related: ["orthodontics", "oral surgery", "paediatric dentistry"] },
  { id: "hvac", label: "HVAC firms",
    words: /\b(hvac|heating|air ?conditioning|a\/?c repair|furnace)\b/i,
    related: ["plumbing", "electrical contractors", "refrigeration"] },
  { id: "veterinary", label: "veterinary clinics",
    words: /\b(vets?|veterinar\w+|animal hospitals?)\b/i,
    related: ["emergency vets", "pet grooming", "boarding kennels"] },
];

/** Words that sound like a criterion but describe nothing a site shows. Each
 *  carries the provable proxy the product document promises, and says plainly
 *  when the proxy is not settleable today either — suggesting a proxy we also
 *  cannot check would just move the disappointment one screen later. */
const UNPROVABLE: Array<{ words: RegExp; why: string; proxy?: Declined["proxy"] }> = [
  {
    words: /\b(revenue|turnover|arr|mrr|\$\s?\d+\s?(k|m|million)|grossing)\b/i,
    why: "no website states its revenue, and a guess dressed as a verdict is the thing this product exists to avoid.",
    proxy: { text: "has 5+ practitioners listed on the site", provableToday: false },
  },
  {
    words: /\b(\d+\+?\s*(employees|staff|people)|headcount|team size)\b/i,
    why: "staff counts are rarely published and almost never current.",
    proxy: { text: "lists 5+ named team members", provableToday: false },
  },
  {
    words: /\b(owner is |owner's |retiring|succession|for sale|exit\w*)\b/i,
    why: "owner intent is not published on a business website.",
  },
  {
    words: /\b(funded|vc[- ]backed|raised|series [a-d]|investor)\b/i,
    why: "local service businesses do not publish funding, and directories that claim it are guessing.",
  },
  {
    words: /\b(years in business|established (in )?\d{4}|since \d{4}|\d+ years old)\b/i,
    why: "a founding year is sometimes on a site and sometimes marketing copy; we do not read it yet.",
    proxy: { text: "states a founding year on the site", provableToday: false },
  },
];

/** Searches for people rather than businesses. Kept narrow on purpose: an
 *  over-eager match here refuses a legitimate search, which is worse than
 *  letting one through to the normal "couldn't tell". */
const PEOPLE =
  /\b(homeowners?|residents?|consumers?|individuals?|job ?seekers?|students?|nurses|find people|people who)\b/i;

/** Criteria about who owns a business rather than what it does. */
const SENSITIVE =
  /\b(religio\w+|christians?|muslims?|jewish|hindus?|catholics?|black[- ]owned|white[- ]owned|asian[- ]owned|hispanic[- ]owned|ethnic\w*|race|republicans?|democrats?|political|lgbt|gay|straight|disab\w+|pregnan\w+|immigra\w+|visa status|age of (the )?owner|male[- ]owned|female[- ]owned|wom[ae]n[- ]owned)\b/i;

/** Vague words, with the observable readings on offer. Every option is either
 *  a real criterion or "drop it" — no option means "we will interpret it for
 *  you", because that is exactly the invented judgment the product refuses. */
const VAGUE: Array<{ words: RegExp; question: string; readings: string[] }> = [
  { words: /\bsmall\b/i,
    question: "\"Small\" is not something a website states. Which of these did you mean?",
    readings: ["booking", "chat"] },
  { words: /\b(modern|outdated|dated|old[- ]looking)\b/i,
    question: "\"Modern\" needs an observable reading. Which one?",
    readings: ["mobile", "stale", "booking"] },
  { words: /\b(busy|popular|thriving|growing|established|reputable|high[- ]end|premium|boutique|quality|professional)\b/i,
    question: "That is a judgment, not something a site shows. The closest observable readings:",
    readings: ["booking", "chat", "reviews"] },
];

// ------------------------------------------------------------------ parsing

const NEGATION =
  /\b(no|not|non|without|lacks?|lacking|missing|don'?t have|doesn'?t have|hasn'?t|haven'?t|never)\b/i;

/** Negation binds to its own clause, and only to its own clause.
 *
 *  Measured the hard way: a window-based version turned "no reviews, that
 *  offer dentistry" into *does not offer dentistry*, because "no" was still
 *  inside the window. So the text before the match is cut at the last clause
 *  boundary — a comma, or a conjunction — and only the tail is tested. */
const CLAUSE_BREAK = /[,;]|\b(?:but|and|that|who|which|with|offers?|offering|provides?)\b/i;

function isNegated(query: string, at: number): boolean {
  const before = query.slice(Math.max(0, at - 60), at);
  const tail = before.split(CLAUSE_BREAK).pop() ?? before;
  return NEGATION.test(tail);
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function criterionFrom(
  signal: ObservableSignal,
  negated: boolean,
  source: string,
): ParsedCriterion {
  const text = negated ? signal.absenceText : signal.presenceText;
  return {
    id: slug(text),
    type: negated ? "absence" : "presence",
    text,
    source,
    signalId: signal.id,
    how: signal.how,
    provable: signal.provable,
  };
}

export function parseSearch(raw: string): ParsedSearch {
  const q = raw.trim();
  const out: ParsedSearch = {
    raw: q,
    where: null,
    what: null,
    criteria: [],
    preferences: [],
    declined: [],
    clarifications: [],
    conflicts: [],
    unrecognised: [],
    overLimit: false,
  };
  if (!q) return out;

  // --- refusals first. A search that is declined should not also be parsed
  //     into criteria, or the confirm step contradicts itself.
  const people = q.match(PEOPLE);
  if (people) {
    out.declined.push({
      kind: "people",
      source: people[0],
      why: "Small Fish searches businesses only. It reads what a business publishes about itself, and it does not profile individuals.",
    });
  }
  const sensitive = q.match(SENSITIVE);
  if (sensitive) {
    out.declined.push({
      kind: "sensitive",
      source: sensitive[0],
      why: "We judge what a business offers and how it operates, not who owns it.",
    });
  }
  for (const u of UNPROVABLE) {
    const m = q.match(u.words);
    if (m) {
      out.declined.push({ kind: "unprovable", source: m[0], why: u.why, proxy: u.proxy });
    }
  }

  // --- where
  const where = q.match(/\b(?:in|near|around|across)\s+([A-Z][\w.'-]*(?:[ -][A-Z][\w.'-]*)*(?:,\s*[A-Z]{2})?)/);
  if (where) out.where = { text: where[1].trim(), marketId: null };

  // --- what
  const niche = NICHES.find((n) => n.words.test(q));
  if (niche) {
    out.what = { text: niche.label, niche: niche.id, related: niche.related };
  }

  // --- criteria, from the signal catalogue. Every occurrence, not just the
  //     first: "with online booking and no online booking" is a contradiction
  //     the confirm step has to flag, and it is invisible if we stop at one.
  for (const s of SIGNALS) {
    const all = new RegExp(s.inCriterion.source, s.inCriterion.flags + "g");
    for (const m of q.matchAll(all)) {
      const c = criterionFrom(s, isNegated(q, m.index), m[0]);
      if (!out.criteria.some((x) => x.id === c.id)) out.criteria.push(c);
    }
  }

  // --- criteria the catalogue does not cover. The general layer: any criterion
  //     in any vertical must produce a check plan, catalogue or no catalogue.
  //     These are honest about needing a model rather than being dropped.
  const verbs =
    /\b(offers?|offering|provides?|provide|does|doing|specialis\w+ in|specializ\w+ in)\s+([a-z][\w ]{2,40}?)(?=[,.]|\s+(and|but|with|that|who|in|near)\b|$)/gi;
  for (const m of q.matchAll(verbs)) {
    const phrase = m[2].trim();
    if (signalForCriterion(phrase)) continue;
    if (SENSITIVE.test(phrase) || PEOPLE.test(phrase)) continue;
    const negated = isNegated(q, m.index);
    const text = `${negated ? "does not offer" : "offers"} ${phrase}`;
    if (out.criteria.some((c) => c.id === slug(text))) continue;
    out.criteria.push({
      id: slug(text),
      type: negated ? "absence" : "presence",
      text,
      source: m[0].trim(),
      signalId: null,
      how: `Reads the pages a site links about "${phrase}" and judges the text. No detector covers this, so it needs a model.`,
      provable: false,
    });
  }

  // --- preferences rank, they do not filter
  for (const m of q.matchAll(/\b(?:prefer|prefers|ideally|bonus if|nice to have)\s+([^,.]{3,60})/gi)) {
    out.preferences.push(m[1].trim());
  }

  // --- vague words get one question each, with observable readings only
  for (const v of VAGUE) {
    const m = q.match(v.words);
    if (!m) continue;
    const options = v.readings
      .map((id) => SIGNALS.find((s) => s.id === id))
      .filter((s): s is ObservableSignal => Boolean(s))
      .map((s) => ({
        label: `${s.absenceText} — ${s.provable ? s.how : "not settleable today"}`,
        criterion: criterionFrom(s, true, m[0]),
      }));
    out.clarifications.push({
      source: m[0],
      question: v.question,
      options: [...options, { label: `Drop "${m[0]}" from the search`, criterion: null }],
    });
  }

  // --- contradictions
  for (let i = 0; i < out.criteria.length; i++) {
    for (let j = i + 1; j < out.criteria.length; j++) {
      const a = out.criteria[i];
      const b = out.criteria[j];
      if (a.signalId && a.signalId === b.signalId && a.type !== b.type) {
        out.conflicts.push({
          a, b,
          why: `"${a.text}" and "${b.text}" cannot both be true of the same business. Drop one.`,
        });
      }
    }
  }

  out.overLimit = out.criteria.length > MAX_CRITERIA;

  // --- what we could not place. Only worth saying when something was parsed;
  //     an entirely unrecognised query is reported by the empty result itself.
  if (!out.what && !out.declined.length) {
    out.unrecognised.push("the kind of business");
  }
  if (!out.where && !out.declined.length) {
    out.unrecognised.push("the location");
  }
  if (!out.criteria.length && !out.declined.length && !out.clarifications.length) {
    out.unrecognised.push("anything to check on their websites");
  }

  return out;
}

// ---------------------------------------------------------------- resolution

export interface Resolved {
  marketId: string | null;
  criterionId: string | null;
  /** Measured matches for the resolved criterion, whole market. */
  matches: number;
  /** Judged candidates — the honest denominator for a rarity warning. */
  judged: number;
  rare: boolean;
  /** Why we are not searching exactly what was asked, when that is the case. */
  note: string | null;
}

/** Map a parsed search onto the markets we have actually measured.
 *
 *  Stage 0 measured four markets. Pretending otherwise would be the easiest
 *  lie in the product, so a search outside them resolves to nothing and says
 *  which four exist, rather than silently returning the nearest thing. */
export function resolveSearch(
  parsed: ParsedSearch,
  index: MarketIndex | null,
): Resolved {
  const none: Resolved = {
    marketId: null, criterionId: null, matches: 0, judged: 0, rare: false, note: null,
  };
  if (!index || !index.markets.length) return none;

  const byNiche = parsed.what?.niche
    ? index.markets.filter((m) => m.niche === parsed.what!.niche)
    : [];
  if (!byNiche.length) {
    return {
      ...none,
      note: parsed.what
        ? `We have not measured ${parsed.what.text} yet. Measured so far: ${index.markets
            .map((m) => `${m.niche.replace(/_/g, " ")} in ${m.metro}`)
            .join("; ")}.`
        : null,
    };
  }

  // Prefer a market whose metro the query names; otherwise the only one.
  const wanted = parsed.where?.text.toLowerCase() ?? "";
  const market =
    byNiche.find((m) => wanted && m.metro.toLowerCase().includes(wanted.split(",")[0].trim())) ??
    byNiche[0];
  const noteParts: string[] = [];
  if (wanted && !market.metro.toLowerCase().includes(wanted.split(",")[0].trim())) {
    noteParts.push(`We have not measured ${parsed.where!.text}; showing ${market.metro}.`);
  }

  // Match a parsed criterion to one the market actually carries, by signal.
  let criterionId: string | null = null;
  for (const c of parsed.criteria) {
    const hit = market.criteria.find(
      (mc) =>
        mc.type === c.type &&
        (c.signalId
          ? signalForCriterion(mc.text)?.id === c.signalId
          : slug(mc.text) === c.id),
    );
    if (hit) { criterionId = hit.id; break; }
  }
  if (!criterionId) {
    const provable = market.criteria.find((mc) => signalForCriterion(mc.text)?.provable);
    criterionId = provable?.id ?? market.criteria[0]?.id ?? null;
    if (parsed.criteria.length) {
      noteParts.push(
        "None of those criteria have been run against this market yet; showing what has.",
      );
    }
  }

  const t = criterionId ? (market.tallies[criterionId] ?? {}) : {};
  const matches = t.match ?? 0;
  const judged = (t.match ?? 0) + (t.no_match ?? 0) + (t.couldnt_tell ?? 0);

  return {
    marketId: market.id,
    criterionId,
    matches,
    judged,
    rare: judged > 0 && matches / judged < RARE_MATCH_RATE,
    note: noteParts.join(" ") || null,
  };
}
