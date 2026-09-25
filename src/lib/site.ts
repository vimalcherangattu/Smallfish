/** Where this site is served from.
 *
 *  A sitemap and a robots.txt both need absolute URLs, and hardcoding the
 *  deployment host in two files is how they drift. Overridable for a custom
 *  domain without touching either.
 */
export const SITE =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.getsmallfish.com";
