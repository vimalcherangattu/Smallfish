import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** Our own robots.txt (S1-14).
 *
 *  Worth writing rather than copying: this product's whole crawling posture is
 *  that robots.txt is honoured, so publishing a careless one of our own would
 *  be an odd way to hold that position.
 *
 *  `/app` is disallowed. It is a client-rendered demo over several megabytes of
 *  static JSON — there is nothing there a crawler can index usefully, and
 *  fetching it repeatedly costs bandwidth for no benefit to anyone. `/api` the
 *  same. The marketing pages and the programmatic market pages are the parts
 *  meant to be found.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/app"] }],
    sitemap: `${SITE}/sitemap.xml`,
  };
}
