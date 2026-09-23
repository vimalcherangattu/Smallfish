import type { MetadataRoute } from "next";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { saturationSet } from "@/lib/saturation";
import { SITE } from "@/lib/site";
import type { MarketIndex } from "@/lib/types";

/** The sitemap (S1-14).
 *
 *  Programmatic pages are only worth generating if they can be found, and the
 *  set of them is derived rather than listed — so the sitemap is derived from
 *  the same `saturationSet` that decides which pages exist. A page that fails
 *  the ≥20-match gate is not published and is not advertised; the two cannot
 *  drift apart, because there is one source for both.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let index: MarketIndex | null = null;
  try {
    const file = path.join(process.cwd(), "public", "data", "index.json");
    index = JSON.parse(await readFile(file, "utf8")) as MarketIndex;
  } catch {
    index = null;
  }
  const { pages } = saturationSet(index);
  const now = new Date();

  return [
    { url: SITE, lastModified: now, priority: 1 },
    { url: `${SITE}/pricing`, lastModified: now, priority: 0.8 },
    { url: `${SITE}/compare`, lastModified: now, priority: 0.7 },
    { url: `${SITE}/opt-out`, lastModified: now, priority: 0.3 },
    ...pages.map((p) => ({
      url: `${SITE}/find/${p.slug}`,
      lastModified: now,
      priority: 0.6,
    })),
  ];
}
