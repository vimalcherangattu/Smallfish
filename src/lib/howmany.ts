/**
 * "How many dentists are in Dallas?" pages (GTM, automated SEO/AEO).
 *
 * People and AI assistants ask exactly that, and the answer is a number we can
 * produce for free from the open listings. Each page answers in its first
 * sentence, then adds what a template page cannot: share with a website, per
 * 10,000 residents, and how the city compares with other cities and trades,
 * all from rows we counted. Pure, so `test_howmany.mjs` holds the slugs.
 */

export interface Trade {
  id: string;
  /** Plural, as people say it: "dentists". */
  label: string;
  /** What `matchTrade` is given. */
  query: string;
}

/** The trades people who sell to small businesses ask about. */
export const TRADES: Trade[] = [
  ["dentists", "dentists", "dentists"],
  ["med-spas", "med spas", "med spas"],
  ["chiropractors", "chiropractors", "chiropractors"],
  ["veterinarians", "veterinarians", "veterinarians"],
  ["physical-therapists", "physical therapists", "physical therapists"],
  ["optometrists", "optometrists", "optometrists"],
  ["hvac-companies", "HVAC companies", "hvac"],
  ["plumbers", "plumbers", "plumbers"],
  ["electricians", "electricians", "electricians"],
  ["roofers", "roofers", "roofers"],
  ["landscapers", "landscapers", "landscapers"],
  ["pest-control-companies", "pest control companies", "pest control"],
  ["house-cleaning-services", "house cleaning services", "cleaning services"],
  ["painters", "painters", "painters"],
  ["auto-repair-shops", "auto repair shops", "auto repair"],
  ["car-dealers", "car dealers", "car dealers"],
  ["law-firms", "law firms", "lawyers"],
  ["accountants", "accountants", "accountants"],
  ["insurance-agents", "insurance agents", "insurance agents"],
  ["real-estate-agents", "real estate agents", "real estate agents"],
  ["restaurants", "restaurants", "restaurants"],
  ["coffee-shops", "coffee shops", "coffee shops"],
  ["bakeries", "bakeries", "bakeries"],
  ["hair-salons", "hair salons", "hair salons"],
  ["barbershops", "barbershops", "barbers"],
  ["nail-salons", "nail salons", "nail salons"],
  ["gyms", "gyms", "gyms"],
  ["yoga-studios", "yoga studios", "yoga studios"],
  ["pet-groomers", "pet groomers", "pet groomers"],
  ["florists", "florists", "florists"],
].map(([id, label, query]) => ({ id, label, query }));

export const citySlug = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** "dentists-in-dallas-tx" */
export const slugFor = (tradeId: string, city: string, state: string) =>
  `${tradeId}-in-${citySlug(city)}-${state.toLowerCase()}`;

/** The trade and the city part back out of a slug, or null. The trade is
 *  found by prefix against the known list, so a city with "in" in its name
 *  cannot split the slug in the wrong place. */
export function parseSlug(slug: string): { trade: Trade; citySlug: string; state: string } | null {
  if (!/^[a-z0-9-]{6,120}$/.test(slug)) return null;
  const trade = TRADES.find((t) => slug.startsWith(`${t.id}-in-`));
  if (!trade) return null;
  const rest = slug.slice(trade.id.length + 4);
  const m = rest.match(/^(.+)-([a-z]{2})$/);
  return m ? { trade, citySlug: m[1], state: m[2].toUpperCase() } : null;
}

export const perTenThousand = (listings: number, pop: number | null) =>
  pop && pop > 0 ? Math.round((listings / pop) * 100_000) / 10 : null;

export const share = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Below this a page says too little to be worth indexing. */
export const MIN_LISTINGS = 20;
