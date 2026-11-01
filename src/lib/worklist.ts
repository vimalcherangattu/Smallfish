/**
 * Which listings a job actually reads. Pure, so `test_worklist.mjs` holds it.
 *
 * ## Why — measured 2026-11-01
 *
 * Of the 72 sites production has read, **32 were one website**,
 * 24hourfitness.com: three gym jobs of twelve sites each, and in one of them
 * ten of the twelve slots went to the same chain. Not one of those 32 matched,
 * and 28 came back "couldn't tell", so the reads that most shaped the
 * measured couldn't-tell rate were of a business that is not small, read
 * again and again. That is
 * two failures at once: the product is for finding small businesses (CLAUDE.md
 * §1), and every one of those reads was paid for.
 *
 * Two rules, in this order:
 *
 *   1. **One read per website.** Several listings that share a site are one
 *      business with several doors; reading it once answers for all of them,
 *      and the customer wants the business once. The first listing is kept, so
 *      the ordering the caller chose survives.
 *   2. **A site behind many listings is a chain, and is left out.** Five or
 *      more listings in one search pointing at one website is a franchise or a
 *      national brand, not a small business. Below that, a local practice with
 *      a second or third office is exactly who the product is for, so the line
 *      is set high on purpose: wrongly dropping a real small business costs a
 *      lead, wrongly keeping a chain costs one read after rule 1.
 *
 * ## The host is the key, not the registrable domain
 *
 * Cutting a host to its last two labels would make every Wix, Squarespace,
 * GoDaddy and `business.site` business one "chain" — `smith.wixsite.com` and
 * `jones.wixsite.com` both become `wixsite.com` — and the rule would delete the
 * smallest businesses first. So only `www.` is removed. A chain that gives each
 * location its own subdomain slips through rule 2; that costs reads, not
 * leads, which is the cheap direction.
 *
 * Uploads apply rule 1 only. The customer chose that list; deciding a business
 * on it is too big for them would be overruling them.
 */

/** Listings sharing one website, at or above which the site is a chain. */
export const CHAIN_MIN = 5;

/** The comparable part of a website: lower-case host without `www.`. Null when
 *  it is not a URL at all, which the caller keeps — the read will say so. */
export function siteKey(site: string | null | undefined): string | null {
  if (!site) return null;
  const raw = /^[a-z][a-z0-9+.-]*:\/\//i.test(site.trim()) ? site.trim() : `http://${site.trim()}`;
  try {
    const host = new URL(raw).hostname.toLowerCase().replace(/\.$/, "");
    return host.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export interface WorkList<T> {
  rows: T[];
  /** Listings dropped because their website was already on the list. */
  duplicates: number;
  /** Websites left out as chains, with how many listings each had. */
  chains: Array<{ site: string; listings: number }>;
}

export function workList<T extends { site?: string | null }>(
  rows: T[],
  opts: { dropChains: boolean },
): WorkList<T> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = siteKey(r.site);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }

  const chains = opts.dropChains
    ? [...counts].filter(([, n]) => n >= CHAIN_MIN).map(([site, listings]) => ({ site, listings }))
    : [];
  const isChain = new Set(chains.map((c) => c.site));

  const seen = new Set<string>();
  const out: T[] = [];
  let duplicates = 0;
  for (const r of rows) {
    const k = siteKey(r.site);
    if (k && isChain.has(k)) continue;
    if (k && seen.has(k)) {
      duplicates += 1;
      continue;
    }
    if (k) seen.add(k);
    out.push(r);
  }

  return { rows: out, duplicates, chains: chains.sort((a, b) => b.listings - a.listings) };
}
