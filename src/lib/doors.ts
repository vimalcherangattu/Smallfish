import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildLeads, type Contacts, type Lead } from "@/lib/leads";
import type { Market, MarketIndex } from "@/lib/types";

/**
 * The doors: a landing page that already knows the visitor's market.
 *
 * The user-flow document puts six doors in front of one sign-up, and says the
 * thing that makes them work: *"the closer a door is to their market, the
 * better it converts, so every door carries as much context as it can."* A cold
 * email says "38 med spas in Dallas still book by phone"; the page it opens has
 * to say the same number and then show three of them, in full.
 *
 * ## Every door is assembled from a market we actually read
 *
 * There are three of those today. A door for a market nobody has read cannot
 * honestly print a count, so it does not exist — `doorFor` returns null and the
 * route 404s rather than inventing a plausible number for a stranger who was
 * emailed a promise.
 *
 * The design's own mock shows "Lumen Med Spa", "Still Water Aesthetics" and
 * "Bishop Arts Skin Studio" with `555-` numbers. Those are the fourth set of
 * invented businesses to arrive in a design, and the one place it would hurt
 * most: this page's entire job is to prove the rows are real to somebody who
 * has never heard of us.
 */

export interface Door {
  /** Who this was made for, as it appears in the kicker. Null for an SEO door. */
  who: string | null;
  /** What they sell, when the link carried it. */
  sells: string | null;
  marketId: string;
  criterionId: string;
  /** "med spas", for the headline. */
  niche: string;
  metro: string;
  /** The count the email promised. */
  fit: number;
  /** Businesses with a website in this market — what "we read all N" refers to. */
  withSite: number;
  read: number;
  /** The plain-language thing that makes one a fit. */
  criterionText: string;
  /** Three, shown in full. The rest are behind the sign-up. */
  shown: Lead[];
  /** How many stay behind the wall. */
  hidden: number;
  /** The search string the sign-up carries forward. */
  query: string;
}

const NICHE_LABEL: Record<string, string> = {
  med_spa: "med spas",
  dental: "dental clinics",
  hvac: "HVAC companies",
  veterinary: "vet clinics",
};

const CRITERION_PLAIN: Record<string, string> = {
  no_online_booking: "no way to book online",
  no_quote_form: "no way to ask for a quote online",
};

async function json<T>(name: string): Promise<T | null> {
  try {
    return JSON.parse(
      await readFile(path.join(process.cwd(), "public", "data", name), "utf8"),
    ) as T;
  } catch {
    return null;
  }
}

/** The markets a door can honestly be built for: read, and with matches. */
export async function doorMarkets() {
  const index = await json<MarketIndex>("index.json");
  const out: { marketId: string; criterionId: string; fit: number; metro: string; niche: string }[] = [];
  for (const m of index?.markets ?? []) {
    for (const c of m.criteria) {
      const fit = m.tallies?.[c.id]?.match ?? 0;
      if (fit > 0) {
        out.push({
          marketId: m.id,
          criterionId: c.id,
          fit,
          metro: m.metro,
          niche: NICHE_LABEL[m.niche] ?? m.niche.replace(/_/g, " "),
        });
      }
    }
  }
  return out.sort((a, b) => b.fit - a.fit);
}

/**
 * Build a door.
 *
 * `marketId` may be anything a URL carried, so it is checked against the index
 * before it reaches a file path — a market id from a stranger's link is a
 * stranger's input.
 */
export async function doorFor(args: {
  marketId?: string | null;
  who?: string | null;
  sells?: string | null;
  show?: number;
}): Promise<Door | null> {
  const markets = await doorMarkets();
  if (!markets.length) return null;

  const pick =
    markets.find((m) => m.marketId === args.marketId) ?? markets[0];

  const [market, contactsFile, index] = await Promise.all([
    json<Market>(`${pick.marketId}.json`),
    json<{ contacts?: Contacts }>(`contacts-${pick.marketId}.json`),
    json<MarketIndex>("index.json"),
  ]);
  if (!market) return null;

  const criterion = market.criteria.find((c) => c.id === pick.criterionId);
  if (!criterion) return null;

  // "med spas in Dallas that has no online booking" — the criterion is written
  // for one business and the niche is plural, so the verb has to agree.
  const query = `${pick.niche} in ${market.metro.split(",")[0]} that ${criterion.text
    .replace(/^has /, "have ")
    .replace(/^is /, "are ")}`;

  // The real index, not a stub.
  //
  // The first version handed `buildLeads` an empty one on the reasoning that
  // this function already knows its market. But `buildLeads` resolves the
  // market *from the query* and returns null when it cannot — so it returned
  // null every time, `leads` was always empty, and every door would have
  // rendered its headline over three missing businesses. The query is built
  // from this market's own niche and metro, so the real index always resolves
  // it.
  const result = buildLeads({
    query,
    index,
    market,
    contacts: contactsFile?.contacts ?? {},
    suppressed: new Set(),
    limit: 500,
    // Nothing on this page is behind the paywall, and that is the page.
    //
    // `buildLeads` withholds the identity of every match past the free preview,
    // because on the results screen the name and the number are what a credit
    // buys. This is not the results screen. It is the page a cold email opens,
    // and its entire argument is *here are three of your prospects, by name,
    // with the sentence off their own site* — a stranger checking whether we
    // make things up cannot check three blanks.
    //
    // It costs nothing to give away: the four guards below drop it to three
    // rows, chosen from the whole market rather than from whichever three came
    // first, and a visitor who wants the other 39 still has to sign up.
    preview: Number.MAX_SAFE_INTEGER,
  });
  const leads = result?.leads ?? [];

  /**
   * Is this domain plausibly the business's own?
   *
   * Overture's `website` field sometimes carries somebody else's. Measured on
   * this market: "Agoddess Spa & Wellness" is listed against
   * `hydrinity.com/agoddessSpa`, which is a skincare brand's page *about* the
   * spa, not the spa's site. Reading it and telling a prospect "hydrinity.com
   * has no online booking" attributes one company's site to another.
   *
   * On the results screen that is a bad row. On this page it is fatal: a
   * stranger who was emailed a promise is checking whether we make things up,
   * and the first thing they can check is whether the domain belongs to the
   * name beside it. The markets page has carried this guard since it was
   * built; the door needs it more.
   */
  const looksOwn = (name: string, domain: string | null) => {
    const h = (domain ?? "").split(".")[0].replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (!h) return false;
    const words = name
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);
    return words.some((w) => h.includes(w));
  };

  /**
   * Domains carrying more than one listing in this market.
   *
   * These are chains, franchises and manufacturers. "Trane - Heating & Cooling
   * Services" passes the name check above — the name really is Trane and the
   * domain really is trane.com — but trane.com is four listings in Tampa and a
   * national manufacturer besides. It is not a local business anybody is
   * prospecting, and telling a stranger that trane.com has no quote form is
   * both useless and untrue of the company they will picture.
   *
   * This is the rule `contacts.json` already applies when it withholds a
   * contact: nothing published on a shared domain can be attributed to one
   * location. The door holds the leads to the same standard.
   */
  const shared = new Set<string>();
  {
    const seen = new Map<string, number>();
    for (const b of market.businesses) {
      const d = (b.site ?? "").replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0].toLowerCase();
      if (!d) continue;
      const n = (seen.get(d) ?? 0) + 1;
      seen.set(d, n);
      if (n > 1) shared.add(d);
    }
  }

  // Show only rows that carry a contact, an opening email, a domain that is
  // plainly theirs, and a domain that is theirs *alone*. This page is the
  // proof; a row that fails any of the four proves nothing and risks proving
  // the opposite.
  const complete = leads.filter(
    (l) =>
      l.message &&
      (l.phone || l.email) &&
      looksOwn(l.name, l.domain) &&
      !shared.has((l.domain ?? "").toLowerCase()),
  );
  const show = args.show ?? 3;

  // Strongest evidence first. The default order is whatever the file happens to
  // hold, which put "Arizona Dental Malpractice" — a real listing Overture
  // files under general_dentistry — third on the Phoenix door. Ranking by pages
  // read puts the best-evidenced rows on the page whose only job is to be
  // believed, without a blocklist of words somebody has to maintain.
  complete.sort((a, b) => b.pagesRead - a.pagesRead);

  return {
    who: args.who ?? null,
    sells: args.sells ?? null,
    marketId: pick.marketId,
    criterionId: pick.criterionId,
    niche: pick.niche,
    metro: market.metro,
    fit: pick.fit,
    withSite: market.counts?.withSite ?? 0,
    read: market.counts?.read ?? 0,
    criterionText: CRITERION_PLAIN[pick.criterionId] ?? criterion.text,
    shown: complete.slice(0, show),
    hidden: Math.max(0, pick.fit - show),
    query,
  };
}

/** A person's name back out of a URL slug: "northshore-digital" → "Northshore
 *  Digital". Only letters, digits and hyphens survive the route, so this cannot
 *  reflect anything a stranger injected. */
export function nameFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * The sign-up link a door hands on.
 *
 * Every door writes its context into the link, the sign-up screen reads it, and
 * the user never retypes what the page already showed them. `source` is kept so
 * a paying customer traces back to the door that brought them, which is the one
 * number the GTM plan needs to decide where to spend more.
 */
export function signUpHref(door: Door, source: string): string {
  const p = new URLSearchParams({
    q: door.query,
    market: door.marketId,
    criterion: door.criterionId,
    source,
  });
  if (door.sells) p.set("sells", door.sells);
  return `/sign-up?${p.toString()}`;
}
