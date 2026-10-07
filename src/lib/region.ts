/**
 * Turning "in Austin", "in Texas" or "across the US" into something readable
 * (S2-09).
 *
 * ## The rule: never refuse a region for being big
 *
 * The obvious handling of "carpenters in Texas" is to tell the customer Texas
 * is too large and ask them to pick a city. That pushes our cost problem onto
 * them, and it is the wrong answer to the wrong question: they did not ask for
 * every carpenter in Texas, they asked whether this is worth their time.
 *
 * So a big region is **always** read, just not exhaustively:
 *
 *   1. Cap the read at `CAP` businesses, whatever the region.
 *   2. Spread that cap across the region's largest cities rather than taking
 *      whatever happens to be nearest one point — a "Texas" sample drawn
 *      entirely from Houston is a Houston sample with a Texas label on it.
 *   3. Say plainly what was covered and what was not, and offer the cities
 *      that would give a better list.
 *
 * That third step is the one that makes the first two honest. A capped read
 * that reports itself as a complete one is the same failure as a guessed
 * verdict: a number with more confidence behind it than the evidence supports.
 *
 * ## Why cities, not an outline
 *
 * A state's outline is a large polygon and reading "inside Texas" would mean
 * scanning candidates across 268,000 square miles to then throw almost all of
 * them away. Sampling cities costs one bounded query per city, covers the
 * population where small businesses actually are, and produces the narrowing
 * list for free — the cities in the sample are exactly the ones worth offering.
 *
 * `places-us.json` is generated from Overture Divisions by
 * `stage0/src/coverage/export_places.py`, from the same release as the
 * candidate businesses, so a city's centre and the businesses found near it
 * agree by construction.
 */

export type Scope = "city" | "state" | "country";

export interface City {
  name: string;
  /** ISO-ish region code, e.g. `US-TX`. */
  state: string;
  pop: number;
  center: [number, number];
}

export interface State {
  code: string;
  name: string;
  pop: number;
  center: [number, number];
}

export interface Places {
  release: string;
  states: State[];
  cities: City[];
}

/**
 * The most businesses one search will read, at any region size.
 *
 * It is a **cost** number, not a quality one. At the measured $0.0168 a read,
 * 100 businesses is $1.68 of reading to answer "is this market worth working",
 * and the free count's 25-business sample already answers a weaker version of
 * the same question for 42 cents. Raising this does not make a state-wide list
 * complete — nothing short of tens of thousands of reads would — it just makes
 * the sample bigger, so it should move only if a measurement says the sample is
 * too small to be useful.
 */
export const CAP = 100;

/** How many cities a big region's sample is spread across. More cities means a
 *  more representative sample and a shorter list per city; past about eight the
 *  per-city slice is too thin to show anyone. */
export const SAMPLE_CITIES = 8;

/** A city read is not capped by `CAP` — a single city is a market someone can
 *  actually work, and cutting it at 100 would be arbitrary. It is capped by the
 *  plan's read allowance, which is enforced in the ledger, not here. */
export const CITY_CAP = 1_000;

/**
 * One spelling for a place, so that what a person types and what Overture
 * stores end up the same string.
 *
 * The abbreviations are not cosmetic. Overture holds **"Saint Louis"**, and
 * almost nobody types that — "St. Louis" returned nothing at all until these
 * three lines existed, and the failure looked like "we do not cover Missouri"
 * rather than "we disagree about an abbreviation". Same for Ft. and Mt.
 *
 * Apostrophes go too, so "Lees Summit" finds "Lee's Summit". Both sides run
 * through this, so removing a character can only ever make a match more likely,
 * never change which city is matched.
 */
const norm = (s: string) =>
  (s ?? "")
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\bst\b/g, "saint")
    .replace(/\bft\b/g, "fort")
    .replace(/\bmt\b/g, "mount")
    .replace(/\s+/g, " ")
    .trim();

/** Common ways people write a country. Not a geocoder — the only question is
 *  "did they mean everywhere?", and everywhere has few names. */
const COUNTRY_WORDS = new Set([
  "us",
  "usa",
  "u s",
  "u s a",
  "america",
  "the us",
  "the usa",
  "united states",
  "the united states",
  "united states of america",
  "nationwide",
  "national",
  "everywhere",
  "anywhere",
  "all of the us",
  "across the us",
]);

const STATE_ABBR: Record<string, string> = {
  al: "Alabama", ak: "Alaska", az: "Arizona", ar: "Arkansas", ca: "California",
  co: "Colorado", ct: "Connecticut", de: "Delaware", fl: "Florida", ga: "Georgia",
  hi: "Hawaii", id: "Idaho", il: "Illinois", in: "Indiana", ia: "Iowa",
  ks: "Kansas", ky: "Kentucky", la: "Louisiana", me: "Maine", md: "Maryland",
  ma: "Massachusetts", mi: "Michigan", mn: "Minnesota", ms: "Mississippi",
  mo: "Missouri", mt: "Montana", ne: "Nebraska", nv: "Nevada",
  nh: "New Hampshire", nj: "New Jersey", nm: "New Mexico", ny: "New York",
  nc: "North Carolina", nd: "North Dakota", oh: "Ohio", ok: "Oklahoma",
  or: "Oregon", pa: "Pennsylvania", ri: "Rhode Island", sc: "South Carolina",
  sd: "South Dakota", tn: "Tennessee", tx: "Texas", ut: "Utah", vt: "Vermont",
  va: "Virginia", wa: "Washington", wv: "West Virginia", wi: "Wisconsin",
  wy: "Wyoming", dc: "District of Columbia",
};

export interface Resolution {
  scope: Scope;
  /** What to call it on screen. */
  label: string;
  /** The state this sits in, when it is a city. */
  state?: State;
  city?: City;
  /** Cities the read is spread across. One entry for a city search. */
  sample: City[];
  /** Reads allotted to each city in `sample`, same order. */
  perCity: number[];
  /** The total this search will read. */
  cap: number;
  /** True when the region is bigger than the cap — i.e. the list is a sample
   *  and the customer has to be told so. */
  sampled: boolean;
  /** Cities worth narrowing to, for a better list. Empty for a city search. */
  narrowTo: City[];
  /** Said to the customer, verbatim. Null when nothing needs saying. */
  note: string | null;
}

/** Cities in a state, largest first. */
export function citiesIn(places: Places, stateCode: string): City[] {
  return places.cities
    .filter((c) => c.state === stateCode)
    .sort((a, b) => b.pop - a.pop);
}

/**
 * Spread a cap across cities in proportion to their population, with a floor.
 *
 * Straight proportional division gives the eighth city two businesses, which is
 * not a sample of anywhere. The floor costs the biggest city some of its share
 * and buys every city in the list enough rows to be worth showing.
 */
export function spread(cap: number, cities: City[], floor = 6): number[] {
  if (!cities.length) return [];
  const n = Math.min(cities.length, Math.max(1, Math.floor(cap / floor)));
  const used = cities.slice(0, n);
  const total = used.reduce((s, c) => s + c.pop, 0) || 1;

  const raw = used.map((c) => Math.max(floor, Math.round((cap * c.pop) / total)));
  // Proportional shares plus a floor overshoot the cap; take the excess off the
  // largest cities, which are the ones that can spare it.
  let over = raw.reduce((s, x) => s + x, 0) - cap;
  for (let i = 0; over > 0 && i < raw.length; i += 1) {
    const take = Math.min(over, raw[i] - floor);
    raw[i] -= take;
    over -= take;
  }
  return raw;
}

/**
 * What a typed place means, and how much of it we will read.
 *
 * Unrecognised input resolves to **null**, not to the whole country. Silently
 * reading all of America because a place name was misspelt is the most
 * expensive possible interpretation of a typo.
 */
export function resolveRegion(
  places: Places,
  typed: string,
  opts: { cap?: number } = {},
): Resolution | null {
  const cap = opts.cap ?? CAP;
  const q = norm(typed);
  if (!q) return null;

  // --- everywhere -----------------------------------------------------------
  if (COUNTRY_WORDS.has(q)) {
    const sample = [...places.cities].sort((a, b) => b.pop - a.pop).slice(0, SAMPLE_CITIES);
    const perCity = spread(cap, sample);
    return {
      scope: "country",
      label: "the United States",
      sample,
      perCity,
      cap,
      sampled: true,
      narrowTo: sample,
      note:
        `The whole country is far more than one search can read, so this reads ${cap} ` +
        `businesses across the ${sample.length} largest cities to show you the shape of it. ` +
        `Pick a city or a state and you get a list you can actually work.`,
    };
  }

  // --- a state --------------------------------------------------------------
  const stateName = STATE_ABBR[q] ?? null;
  const state =
    places.states.find((s) => norm(s.name) === q) ??
    (stateName ? places.states.find((s) => norm(s.name) === norm(stateName)) : undefined) ??
    places.states.find((s) => norm(s.code.replace(/^US-/, "")) === q);

  if (state) {
    const all = citiesIn(places, state.code);
    const sample = all.slice(0, SAMPLE_CITIES);
    const perCity = spread(cap, sample);
    return {
      scope: "state",
      label: state.name,
      state,
      sample,
      perCity,
      cap,
      sampled: true,
      narrowTo: all.slice(0, 12),
      note:
        `${state.name} is bigger than one search can read, so this reads ${cap} businesses ` +
        `spread across its ${sample.length} largest cities rather than everything in one of ` +
        `them. There are many more, narrow to a city and you get a list you can work ` +
        `through, at the same price per match.`,
    };
  }

  // --- a city ---------------------------------------------------------------
  //
  // A few names people type that no listing spells that way. Deliberately
  // short and unambiguous: "la" is not here, because `STATE_ABBR` reads it as
  // Louisiana and a nickname must never outrank a real state code.
  const ALIAS: Record<string, string> = {
    nyc: "New York",
    "new york city": "New York",
    philly: "Philadelphia",
    vegas: "Las Vegas",
    "las vegas nv": "Las Vegas",
    sf: "San Francisco",
    "the bay": "San Francisco",
    nola: "New Orleans",
  };
  const aliased = ALIAS[q];
  if (aliased) {
    const hit = places.cities
      .filter((c) => norm(c.name) === norm(aliased))
      .sort((a, b) => b.pop - a.pop)[0];
    if (hit) {
      const st = places.states.find((s) => s.code === hit.state);
      return {
        scope: "city",
        label: st ? `${hit.name}, ${st.name}` : hit.name,
        state: st,
        city: hit,
        sample: [hit],
        perCity: [CITY_CAP],
        cap: CITY_CAP,
        sampled: false,
        narrowTo: [],
        note: null,
      };
    }
  }

  // "Austin, TX" and "Austin Texas" both name a state; use it, because there
  // are two Austins and picking the bigger one silently would hand somebody a
  // list from the wrong one.
  const parts = q.split(" ");
  let wanted: string | null = null;
  /** The words the state was written as, which is what gets removed to leave
   *  the city. Removing the *resolved* name instead is a bug that only shows
   *  on abbreviations: "austin tx" minus "texas" is five characters off the
   *  end of a nine-character string, leaving "aust", which matches no city. */
  let wantedWords = 0;
  for (let i = 1; i < parts.length; i += 1) {
    const tail = parts.slice(i).join(" ");
    const hit =
      STATE_ABBR[tail] ??
      places.states.find((s) => norm(s.name) === tail)?.name ??
      null;
    if (hit) {
      wanted = hit;
      wantedWords = parts.length - i;
      break;
    }
  }

  const codeOf = (name: string) =>
    places.states.find((s) => norm(s.name) === norm(name))?.code ?? null;
  const wantedCode = wanted ? codeOf(wanted) : null;
  const cityName = wanted ? parts.slice(0, parts.length - wantedWords).join(" ") : q;

  const named = places.cities
    .filter((c) => norm(c.name) === norm(cityName || q))
    .filter((c) => !wantedCode || c.state === wantedCode)
    .sort((a, b) => b.pop - a.pop);

  const city = named[0];
  if (!city) return null;

  const inState = places.states.find((s) => s.code === city.state);
  // Two cities with one name, and no state given. Read the larger and say so —
  // refusing would be unhelpful, and choosing silently would be worse.
  const ambiguous = named.length > 1;

  return {
    scope: "city",
    label: inState ? `${city.name}, ${inState.name}` : city.name,
    state: inState,
    city,
    sample: [city],
    perCity: [CITY_CAP],
    cap: CITY_CAP,
    sampled: false,
    narrowTo: [],
    note: ambiguous
      ? `There is more than one ${city.name}. This is the one in ${inState?.name ?? city.state}, ` +
        `the largest. Add a state to pick a different one.`
      : null,
  };
}

/**
 * The city somebody probably meant, when what they typed is not one.
 *
 * ## Why this is here at all
 *
 * The owner typed **"pheonix"**. It is two keystrokes from the fourth-largest
 * city in the country and `resolveRegion` returns null for it, so the screen
 * said "We couldn't place that" and the search stopped. That is the right
 * answer to the wrong question: we are not uncertain about where they meant,
 * we are uncertain about one transposed vowel.
 *
 * ## It offers, it never substitutes
 *
 * Silently reading Phoenix because somebody typed Pheonix is the same class of
 * mistake as `marketFor`'s old `?? candidates[0]` — answering confidently for a
 * place nobody asked about. So this returns a suggestion the screen shows as a
 * question, and the person presses it or does not.
 *
 * ## The distance is bounded by the word, not by a constant
 *
 * One edit for a short name, two for a long one. A flat threshold of two turns
 * "Troy" into "Tracy" and "Cary" into "Gary"; a flat one never reaches
 * "Albequerque". Transposition counts as a single edit because it is the most
 * common typo there is — and it is exactly the one in "pheonix".
 */
export function distance(a: string, b: string, cap: number): number {
  // Damerau-Levenshtein. Three rows are kept rather than two, because the
  // transposition term reads the row before last; a two-row version silently
  // degrades to plain Levenshtein and scores "pheonix" at 2 instead of 1.
  //
  // It gives up as soon as every cell in a row is past the cap — this runs
  // against 2,398 cities, on input that has already failed to resolve.
  if (Math.abs(a.length - b.length) > cap) return cap + 1;

  const width = b.length + 1;
  let before: number[] = new Array(width).fill(0);
  let prev: number[] = Array.from({ length: width }, (_, j) => j);
  let cur: number[] = new Array(width).fill(0);

  for (let i = 1; i <= a.length; i += 1) {
    cur[0] = i;
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, before[j - 2] + 1);
      }
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > cap) return cap + 1;
    [before, prev, cur] = [prev, cur, before];
  }
  return prev[b.length];
}

export interface NearMiss {
  city: City;
  label: string;
}

export function nearestCity(places: Places | null, typed: string): NearMiss | null {
  const q = norm(typed);
  if (!places || q.length < 4) return null;
  // Only for input that resolves to nothing: a real city is never "near" another.
  if (resolveRegion(places, typed)) return null;

  const cap = q.length >= 7 ? 2 : 1;
  let best: { city: City; d: number } | null = null;
  for (const c of places.cities) {
    const name = norm(c.name);
    const d = distance(q, name, cap);
    if (d > cap) continue;
    // Ties broken by population: two cities one edit away, and the bigger one
    // is the likelier intent.
    if (!best || d < best.d || (d === best.d && c.pop > best.city.pop)) {
      best = { city: c, d };
    }
  }
  if (!best) return null;
  const state = places.states.find((s) => s.code === best!.city.state);
  return {
    city: best.city,
    label: state ? `${best.city.name}, ${state.name}` : best.city.name,
  };
}

/** What the confirm screen says a search will cost us, before it runs.
 *
 *  Reads, not matches: the customer pays per match, and this is the number that
 *  bounds *our* bill when a criterion matches nothing at all. It is shown
 *  because a search whose cost is invisible to us is one nobody notices getting
 *  expensive. */
export const readsFor = (r: Resolution) =>
  r.perCity.reduce((s, n) => s + n, 0);
