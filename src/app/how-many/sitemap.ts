import type { MetadataRoute } from "next";

import { MIN_LISTINGS } from "@/lib/howmany";
import { allCounts } from "@/lib/howmanydata";
import { SITE } from "@/lib/site";

/** /how-many/sitemap.xml: every counted page worth indexing, dated by when
 *  it was counted. Its own file, so the main sitemap's rules stay its own. */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const rows = await allCounts();
  return [
    { url: `${SITE}/how-many`, lastModified: new Date(), priority: 0.6 },
    ...rows
      .filter((r) => r.listings >= MIN_LISTINGS)
      .map((r) => ({ url: `${SITE}/how-many/${r.slug}`, lastModified: new Date(r.computed_at), priority: 0.5 })),
  ];
}
