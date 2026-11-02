import "server-only";

import { publicDns, type PublicDns } from "@/lib/fetchoutcome";
import { siteKey } from "@/lib/worklist";

/**
 * How many of a pool's listed websites still exist, from a random sample
 * checked against public DNS. The number `liveSites` (pool.ts) turns into the
 * claim `/app/find` leads with.
 *
 * ## Why a sample, and why 40
 *
 * A metro pool lists thousands of sites, and this runs on the free anonymous
 * front door, on a cache miss only. Forty lookups in parallel cost about a
 * second, against a scan that already takes three to five. At the GTM stream's
 * measured 8–14% dead, forty puts the live share within roughly ±10 points,
 * which is why the screen says "about"; a pool of forty or fewer is checked
 * whole and the number is exact.
 *
 * ## What counts
 *
 * Only a definite answer: public DNS saying the name does not exist or points
 * nowhere is dead; resolving is live. A lookup that fails is dropped from both
 * sides rather than guessed, so our network never shrinks their market.
 */
export const LIVENESS_SAMPLE = 40;

export async function measureLiveness(
  sites: Array<string | null | undefined>,
  opts: { n?: number; dns?: (host: string) => Promise<PublicDns>; random?: () => number } = {},
): Promise<{ checked: number; dead: number } | null> {
  const n = opts.n ?? LIVENESS_SAMPLE;
  const dns = opts.dns ?? ((h: string) => publicDns(h));
  const random = opts.random ?? Math.random;

  // One lookup per host: a chain's ten locations are one domain.
  const hosts = [...new Set(sites.map((s) => siteKey(s)).filter((h): h is string => !!h))];
  if (!hosts.length) return null;

  // Partial Fisher–Yates: a uniform sample without sorting the whole list.
  const pick = hosts.slice();
  const k = Math.min(n, pick.length);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(random() * (pick.length - i));
    [pick[i], pick[j]] = [pick[j], pick[i]];
  }

  const answers = await Promise.all(pick.slice(0, k).map((h) => dns(h).catch(() => null)));
  const definite = answers.filter((a): a is Exclude<PublicDns, null> => a !== null);
  if (!definite.length) return null;
  return {
    checked: definite.length,
    dead: definite.filter((a) => a === "nxdomain" || a === "no_address").length,
  };
}
