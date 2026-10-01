import { readFile } from "node:fs/promises";
import path from "node:path";

import { composeMessage, host, prettyPhone } from "@/lib/leads";
import type { Market, VerdictKind } from "@/lib/types";

/**
 * The one worked example, read from measured data at build time.
 *
 * Lived inside `app/page.tsx` until the home page was restructured on
 * 2026-10-01 and the method blocks — the junk-list row counts, the annotated
 * crawler page, the fit/don't/couldn't-tell strip — moved to `/how-we-check`.
 * Two pages needed the same figures, and two copies of this loader would be
 * two pages quoting different numbers the first time the data changed.
 *
 * ## It is assembled, never written
 *
 * Everything here comes out of `public/data/dental-phoenix.json` and the same
 * `composeMessage` the product runs. If the data changes the pages change; if
 * the clinic opts out they disappear. A marketing page whose proof is
 * hard-coded is a screenshot, and a screenshot is the thing these pages are
 * arguing against.
 */

/** The market the example blocks are built from. */
export const SHOWCASE = { file: "dental-phoenix", criterion: "no_online_booking" };

/** The clinic in the example card: real, readable, and published its own
 *  contact details. Named here so a data change that removes it fails the
 *  copy test loudly instead of silently dropping the card. */
export const SHOWCASE_BUSINESS = "Simply Dentistry";

export const CMS_NAME: Record<string, string> = {
  wordpress: "WordPress",
  wix: "Wix",
  squarespace: "Squarespace",
  shopify: "Shopify",
  webflow: "Webflow",
  godaddy_website_builder: "GoDaddy",
};

export interface Showcase {
  ask: string;
  fit: number;
  notFit: number;
  unclear: number;
  checked: number;
  /** Every dental business Overture lists in Phoenix — the size of the list
   *  somebody would otherwise buy, and the only big number on these pages a
   *  stranger can size up without being told what it counts. */
  listed: number;
  /** Listings with no website at all: nothing to read, and a bought list
   *  carries them anyway. */
  noSite: number;
  /** Listings sharing a domain with another listing: chains and platform
   *  pages, where nothing published can be attributed to one location. */
  sharedRows: number;
  worstDomain: string;
  worstDomainRows: number;
  blocked: number;
  couldntTell: number;
  /** The second real business in the junk list's "keep" rows. */
  keep2: string;
  name: string;
  city: string;
  phone: string | null;
  email: string | null;
  domain: string | null;
  message: string | null;
  pagesRead: number;
  cms: string | null;
  address: string;
}

export async function showcase(): Promise<Showcase | null> {
  let market: Market;
  try {
    market = JSON.parse(
      await readFile(
        path.join(process.cwd(), "public", "data", `${SHOWCASE.file}.json`),
        "utf8",
      ),
    ) as Market;
  } catch {
    return null;
  }

  const criterion = market.criteria.find((c) => c.id === SHOWCASE.criterion);
  if (!criterion) return null;

  const t = market.tallies?.[SHOWCASE.criterion] ?? {};
  const n = (k: VerdictKind) => (t as Record<string, number>)[k] ?? 0;
  const fit = n("match");
  const notFit = n("no_match");
  // A site that blocked us and a site we read but could not settle are the same
  // thing to a customer: we will not claim either way, and neither is billed.
  const unclear = n("couldnt_tell") + n("blocked");

  const b = market.businesses.find((x) => x.name === SHOWCASE_BUSINESS);
  if (!b) return null;

  // The junk-list block's rejection reasons, counted rather than imagined.
  // The design shipped eight named clinics — "Cedar Point Dental · closed in
  // 2024", "Sonoran Smile Co · email bounced" — and seven of the eight names
  // are in no data file we hold. Publishing a trading claim like that about a
  // business that may well exist is the one invention on these pages that
  // could do somebody real harm, so the rows are the real categories instead.
  const domains = new Map<string, number>();
  for (const x of market.businesses) {
    const h = host(x.site);
    if (h) domains.set(h, (domains.get(h) ?? 0) + 1);
  }
  let worstDomain = "";
  let worstDomainRows = 0;
  let sharedRows = 0;
  for (const [d, n2] of domains) {
    if (n2 > 1) sharedRows += n2;
    if (n2 > worstDomainRows) {
      worstDomainRows = n2;
      worstDomain = d;
    }
  }

  let contacts: Record<
    string,
    { emails?: { value: string }[]; phones?: { value: string }[]; withheld?: string | null }
  > = {};
  try {
    contacts = JSON.parse(
      await readFile(
        path.join(process.cwd(), "public", "data", `contacts-${SHOWCASE.file}.json`),
        "utf8",
      ),
    ).contacts;
  } catch {
    contacts = {};
  }
  const c = contacts[b.id] ?? {};
  const usable = !c.withheld;

  return {
    ask: `Dental clinics in Phoenix that ${criterion.text.replace(/^has no/, "don’t have")}.`,
    fit,
    notFit,
    unclear,
    checked: fit + notFit + unclear,
    listed: market.counts?.candidates ?? 0,
    noSite: (market.counts?.candidates ?? 0) - (market.counts?.withSite ?? 0),
    sharedRows,
    worstDomain,
    worstDomainRows,
    blocked: n("blocked"),
    couldntTell: n("couldnt_tell"),
    keep2:
      market.businesses.find(
        (x) =>
          x.name !== SHOWCASE_BUSINESS &&
          x.verdicts[SHOWCASE.criterion]?.verdict === "match" &&
          !contacts[x.id]?.withheld &&
          (contacts[x.id]?.emails?.length ?? 0) > 0,
      )?.name ?? "",
    name: b.name,
    city: b.addr.split(",").slice(-2).join(",").trim(),
    phone: prettyPhone((usable ? c.phones?.[0]?.value : null) ?? b.phone ?? null),
    email: (usable ? c.emails?.[0]?.value : null) ?? null,
    domain: host(b.site),
    message: composeMessage(b, criterion),
    pagesRead: b.read?.pages ?? 0,
    cms: b.read?.cms?.[0] ?? null,
    address: b.addr,
  };
}
