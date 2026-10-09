/**
 * Where candidates come from, behind one interface.
 *
 * ## Why this exists
 *
 * The first atom of the product is **a pool**: businesses in a trade, in a
 * place. Everything after it — read, judge, contact, draft, charge — works the
 * same whatever filled the pool. `supply.ts` was that pool and also the only
 * possible one, with Overture welded into every caller.
 *
 * That mattered because the pool is measurably thin. `docs/stage0-coverage-
 * report.md` §7a: Overture's overlap with Google's places is **31.1% for HVAC
 * in Tampa**, 48% for med spa in Dallas, and only veterinary clears 70%. That
 * is gate item 1 failing, and its stated cause is open-data coverage. A
 * product that cannot change where its candidates come from cannot fix its own
 * gate.
 *
 * ## The rule this changes, and the one it keeps
 *
 * CLAUDE.md said **"Never scrape Google Maps"**, flatly. The owner reversed it
 * on 2026-10-09 after the trade-off was laid out, and the reversal is recorded
 * in `PROJECT_PLAN.md`'s decision log rather than made quietly here.
 *
 * What replaces it is narrower and, I think, the actually load-bearing half:
 *
 * > **Use it to aim, never resell it.** A provider decides *which websites we
 * > open*. What we sell is our own reading of the business's own public site,
 * > with our own proof sentence. Their payload is transient — we keep our
 * > verdict, our evidence, and an id, and nothing else.
 *
 * That is not a new principle. "Store extracted facts, not page copies" has
 * been in CLAUDE.md since the start; this applies the same line to a provider
 * instead of to a web page. `test_providers.mjs` holds it: a `Candidate`
 * deliberately has nowhere to put a review body, because a field that exists
 * is a field something will eventually persist.
 *
 * ## What is deliberately not here
 *
 * Review *text* as a filter signal. It is the richest thing a scraper returns
 * and the one with a second question attached — reviews are user-generated
 * content under somebody else's licence. Rating and review **count** are
 * numbers and travel; the prose does not, until somebody who knows the law has
 * looked at it. Flagged rather than quietly shipped.
 */

import type { Resolution } from "@/lib/region";
import { RADIUS_MILES, supplyFor } from "@/lib/supply";

/**
 * One candidate business, in the only shape the rest of the product needs.
 *
 * **Note what is missing.** No review bodies, no photos, no opening hours, no
 * provider payload. The product reads the business's own website; everything
 * here exists to decide *which* website and to attribute the read. A field
 * added to this interface is a field that ends up in a database, so the
 * interface is the policy.
 */
export interface Candidate {
  /** Ours, and stable: `<provider>:<their id>` for anything but Overture,
   *  whose ids are already the ones every existing unlock and suppression row
   *  is keyed by and so pass through unprefixed. */
  id: string;
  name: string;
  site: string | null;
  phone: string | null;
  /** The listing address. Used to attribute a page to this business by its
   *  town, never shown as a verified address. */
  addr: string | null;
  lat: number;
  lon: number;
  /** Which provider produced it. Kept so a row can always say where it came
   *  from, and so a provider can be switched off and its rows found. */
  source: string;
  /** Public numbers, for ordering candidates. Not resold and not shown as
   *  theirs: a rating is a number, and the prose behind it is not ours. */
  rating?: number | null;
  reviews?: number | null;
}

/**
 * Candidates we can actually do anything with.
 *
 * The product reads a website; a business without one cannot be judged, so it
 * never belongs on a job's work list. Both providers already filter, but the
 * **type** is what makes it impossible to forget: `Candidate.site` is nullable
 * because a listing's is, and this is the one place that narrowing happens.
 * The compiler caught both call sites the moment the adapter went in.
 */
export const readable = (rows: Candidate[] = []): Array<Candidate & { site: string }> =>
  rows.filter((r): r is Candidate & { site: string } => Boolean(r.site && r.site.trim().length > 3));

export interface SupplyQuery {
  /** Overture taxonomy ids. Providers that take words use `trade` instead. */
  categories: string[];
  /** The trade in the customer's own words, for providers that search text. */
  trade: string;
  region: Resolution;
  limit?: number;
  exclude?: Iterable<string>;
  radiusMiles?: number;
  /** False counts without fetching rows, which is what the free count does. */
  rows?: boolean;
}

export interface SupplyResult {
  listings: number;
  withSite: number;
  ms: number;
  rows?: Candidate[];
  source: string;
  /** Why this answer is less than it could be, in the person's terms. */
  degraded?: string | null;
}

export interface SupplyProvider {
  id: string;
  label: string;
  /** Usable on this deployment. A provider needing a key it has not got is
   *  not an error, it is simply not available, and the chooser moves on. */
  ready(): boolean;
  /** Why not, when it is not. */
  unavailable(): string | null;
  find(q: SupplyQuery): Promise<SupplyResult>;
}

/* ------------------------------------------------------------- Overture -- */

/**
 * The open release, read over HTTPS with DuckDB. Free, no key, no terms to
 * breach, and thin in the ways the coverage report measured.
 *
 * Stays the default. A provider that costs money per record should be a choice
 * somebody makes, not what happens when nobody decides.
 */
export const overture: SupplyProvider = {
  id: "overture",
  label: "Open business listings",
  ready: () => true,
  unavailable: () => null,
  async find(q) {
    const s = await supplyFor(q.categories, q.region, {
      rows: q.rows,
      limit: q.limit,
      exclude: q.exclude,
      radiusMiles: q.radiusMiles ?? RADIUS_MILES,
    });
    return {
      listings: s.listings,
      withSite: s.withSite,
      ms: s.ms,
      source: "overture",
      rows: s.rows?.map((r) => ({
        // Unprefixed: these ids are what every unlock, suppression and
        // `everGivenIds` row in the database is already keyed by, and
        // renaming them would silently un-suppress businesses that had asked
        // to be left alone.
        id: r.id,
        name: r.name,
        site: r.site,
        phone: r.phone,
        addr: r.addr ?? null,
        lat: r.lat,
        lon: r.lon,
        source: "overture",
      })),
    };
  },
};

/* ---------------------------------------------------------------- Apify -- */

const APIFY_BASE = "https://api.apify.com/v2";

/** Pull a field that different actors spell differently, without guessing. */
const pick = (o: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};
const num = (o: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
};

/**
 * A commissioned scrape, via Apify.
 *
 * ## Shape of the risk, stated where the code is
 *
 * Google's terms prohibit scraping their maps. Commissioning an actor does not
 * make that somebody else's problem, it splits it: the vendor runs the
 * scraper, we ask for the result. It is contract, not computer-crime — which
 * is why `hiQ v. LinkedIn` was never the reassurance CLAUDE.md's old note
 * correctly said it was not.
 *
 * What makes it defensible here is the narrowness: this picks **which websites
 * to open**. Nothing it returns is sold, shown as ours, or kept beyond the id.
 * The product the customer pays for is our reading of the business's own site.
 *
 * ## Nothing is guessed
 *
 * The actor is `APIFY_ACTOR`, with no default. Google Maps actors differ in
 * both input and output field names, and a wrong id baked in here would either
 * fail loudly in production or, worse, run and bill for the wrong thing. If it
 * is unset this provider is simply unavailable and Overture answers.
 */
export const apify: SupplyProvider = {
  id: "apify",
  label: "Commissioned listings",
  ready: () => Boolean(process.env.APIFY_TOKEN && process.env.APIFY_ACTOR),
  unavailable: () =>
    !process.env.APIFY_TOKEN
      ? "No APIFY_TOKEN on this deployment."
      : !process.env.APIFY_ACTOR
        ? "No APIFY_ACTOR set, and there is no safe default: actors differ in what they take and return."
        : null,

  async find(q) {
    const started = Date.now();
    const token = process.env.APIFY_TOKEN!;
    const actor = process.env.APIFY_ACTOR!;
    const want = Math.max(1, Math.min(q.limit ?? 100, 1000));
    const skip = new Set(q.exclude ?? []);

    // `run-sync-get-dataset-items` runs the actor and returns its rows in one
    // call, which is what a request-scoped fetch needs. It has its own
    // timeout; ours is shorter, because a search that hangs is worse for the
    // person waiting than one that falls back.
    const res = await fetch(
      `${APIFY_BASE}/acts/${encodeURIComponent(actor)}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchStringsArray: [q.trade],
          locationQuery: q.region.label,
          maxCrawledPlacesPerSearch: want,
          language: "en",
          // Asking for less is cheaper and is also the policy: we do not want
          // reviews, photos or opening hours, so we do not pay to collect them.
          scrapeReviewsPersonalData: false,
          maxReviews: 0,
          maxImages: 0,
        }),
        signal: AbortSignal.timeout(120_000),
      },
    );

    if (!res.ok) {
      throw new Error(`apify ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }

    const items = (await res.json()) as Array<Record<string, unknown>>;
    const rows: Candidate[] = [];
    let withSite = 0;

    for (const it of Array.isArray(items) ? items : []) {
      const placeId = pick(it, "placeId", "place_id", "cid", "fid");
      const name = pick(it, "title", "name") ?? "";
      if (!placeId || !name) continue;

      const site = pick(it, "website", "site", "url");
      if (site) withSite += 1;

      const id = `apify:${placeId}`;
      if (skip.has(id)) continue;

      const loc = (it.location ?? {}) as Record<string, unknown>;
      rows.push({
        id,
        name,
        site,
        phone: pick(it, "phone", "phoneUnformatted", "internationalPhoneNumber"),
        addr: pick(it, "address", "formattedAddress", "fullAddress"),
        lat: num(loc, "lat", "latitude") ?? num(it, "lat", "latitude") ?? 0,
        lon: num(loc, "lng", "lon", "longitude") ?? num(it, "lng", "lon", "longitude") ?? 0,
        source: "apify",
        rating: num(it, "totalScore", "rating"),
        reviews: num(it, "reviewsCount", "userRatingCount", "reviews_count"),
      });
    }

    // Only businesses with a website are worth anything downstream: the whole
    // product is reading one. Said here rather than filtered silently, so the
    // count and the rows describe the same set.
    const readable = rows.filter((r) => r.site && r.site.trim().length > 3);

    return {
      listings: Array.isArray(items) ? items.length : 0,
      withSite,
      ms: Date.now() - started,
      source: "apify",
      rows: q.rows === false ? undefined : readable,
      degraded:
        readable.length < want
          ? `Asked for ${want} and the provider returned ${readable.length} with a website.`
          : null,
    };
  },
};

/* --------------------------------------------------------------- choose -- */

export const PROVIDERS: SupplyProvider[] = [apify, overture];

/**
 * Which provider answers.
 *
 * Overture unless something better is both configured **and** asked for.
 * `SUPPLY_PROVIDER` names the preference; absent, the free one wins. A paid
 * provider that switched itself on because a key happened to exist is a bill
 * nobody chose.
 */
export function providerFor(preferred?: string | null): SupplyProvider {
  const want = (preferred ?? process.env.SUPPLY_PROVIDER ?? "").trim().toLowerCase();
  if (want) {
    const found = PROVIDERS.find((p) => p.id === want);
    if (found?.ready()) return found;
  }
  return overture;
}

/**
 * Ask the chosen provider, and fall back rather than failing.
 *
 * A commissioned scrape can be rate-limited, blocked or simply down — these
 * actors break when Google changes, which is a known cost of the approach. A
 * search that dies because the paid provider is having a bad afternoon is
 * worse than one that quietly returns the open data and says it did.
 */
export async function findCandidates(
  q: SupplyQuery,
  preferred?: string | null,
): Promise<SupplyResult> {
  const chosen = providerFor(preferred);
  if (chosen.id === overture.id) return overture.find(q);
  try {
    return await chosen.find(q);
  } catch (err) {
    const fell = await overture.find(q);
    return {
      ...fell,
      degraded:
        `${chosen.label} did not answer (${String(err).slice(0, 80)}), so this is the ` +
        `open listings instead.`,
    };
  }
}
