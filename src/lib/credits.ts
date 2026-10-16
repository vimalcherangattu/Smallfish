/**
 * "Website by X" (GTM, agency prospects from footer credits, 2026-10-16).
 *
 * Agencies sign the sites they build, nearly always in the footer: "Website
 * by Acme", "Designed by", "Powered by". Read across a trade in a city, the
 * credits say which agency builds for dentists in Phoenix, with the sites as
 * proof. That is a better reason to write to an agency than a guess at its
 * niche from its own about page.
 *
 * Pure: the extractor takes a page's HTML and returns the credits on it.
 * `test_credits.mjs` holds it. The crawl lives in the route, which fetches one
 * home page per business, honours robots.txt and keeps the credit, not the
 * page.
 */

export interface Credit {
  /** The agency's domain, from the credit's link. */
  agency: string;
  /** What the link said, cleaned: usually the agency's name. */
  name: string | null;
  /** The phrase in front of it, e.g. "website by". */
  phrase: string;
}

/** The words that introduce a credit. "Powered by" is mostly a platform, so it
 *  counts only when the link is not one (`PLATFORMS`). */
const LEAD =
  /\b((?:web\s*site|site|web\s*design(?:\s*(?:&|and)\s*development)?|design(?:ed)?(?:\s*(?:&|and)\s*(?:developed|hosted|built))?|develop(?:ed|ment)|built|created|crafted|made|hand\s*crafted|marketing|seo|powered|maintained|managed|hosted)\s*(?:with\s*\S+\s*)?by)\s*:?\s*$/i;

/** Builders, platforms and directories: a credit to one of these is not an
 *  agency choosing to sign its work. */
export const PLATFORMS =
  /(^|\.)(wix|squarespace|wordpress|wpengine|godaddy|shopify|weebly|webflow|duda|jimdo|strikingly|site123|google|facebook|instagram|yelp|bing|yahoo|apple|microsoft|elementor|divi|elegantthemes|themeforest|envato|astra|wpastra|generatepress|kadence|oceanwp|genesis|studiopress|cloudflare|hostgator|bluehost|siteground|namecheap|ionos|1and1|vistaprint|homestead|websitepro|yola|carrd|ghost|hubspot|mailchimp|jotform|typeform|calendly|vagaro|mindbody|squareup|square|zocdoc|healthgrades|nextdoor|bbb|w3|schema|cookieyes|termly|iubenda|onetrust|accessibe|userway|recaptcha|gstatic|youtube|vimeo|twitter|x|linkedin|tiktok|pinterest|github|netlify|vercel)\.[a-z.]+$/i;

/** Firms that build thousands of sites for one trade off a template. Real
 *  credits and worth counting, but not an agency that will read a cold email:
 *  kept in the data, kept out of the prospects. */
export const NETWORKS =
  /(^|\.)(scorpion|hibu|thryv|yodle|prosites|officite|pbhs|televox|lighthouse360|dentalqore|smilesource|progressive-dental|einstein|dentalrevenue|roya|doctorlogic|vetstreet|lifelearn|beyondindigo|webdvm|lightspeed|ilawyermarketing|justia|findlaw|lawyers|martindale|nolo|myprovider|ihealthspot|chirotouch|chiromatrix|vetmatrix|imatrix|townsquare|yp|reachlocal|localiq|gannett|dexmedia|webstarts|websitebuilder|homeadvisor|angi|houzz|porch|contractorsites|plumbingwebmasters|hookagency|blue-corona|bluecorona|servicetitan|housecall|jobber|roofle|roofr|smartsites|webfx|boostability|web\.com|network-solutions|networksolutions|tebra|patientpop|weave|nexhealth|solutionreach|demandforce|lighthouse|rectanglehealth|modento|yodle)\.[a-z.]+$/i;

const host = (href: string, base: string): string | null => {
  try {
    const u = new URL(href, base);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** The registrable part, roughly: enough to tell `shop.acme.com` from `acme.com`
 *  is the same business, without a public-suffix list. */
const root = (h: string) => h.split(".").slice(-2).join(".");

const text = (s: string) =>
  s
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&copy;|©/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * The credits on one page. `site` is the page's own URL, so a link back to
 * the business itself is never taken for its builder.
 */
export function creditsIn(html: string, site: string): Credit[] {
  const self = host(site, site);
  if (!self) return [];
  // Credits live at the bottom. Reading the last stretch only keeps a blog
  // post that says "designed by our team" out of it, and is cheaper.
  const tail = html.length > 60_000 ? html.slice(-60_000) : html;
  const out: Credit[] = [];
  const seen = new Set<string>();
  for (const m of tail.matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]{0,200}?)<\/a>/gi)) {
    const agency = host(m[1], site);
    if (!agency || root(agency) === root(self) || seen.has(agency)) continue;
    const label = text(m[2]);
    const before = text(tail.slice(Math.max(0, (m.index ?? 0) - 240), m.index)).slice(-80);
    // Either the words sit in front of the link ("Website by <a>Acme</a>") or
    // inside it ("<a>Website by Acme</a>").
    const outside = LEAD.exec(before);
    const inside = /^(.{0,60}?\bby)\s*:?\s+(.+)$/i.exec(label);
    const phrase = outside?.[1] ?? (inside && LEAD.test(inside[1]) ? inside[1] : null);
    if (!phrase) continue;
    if (PLATFORMS.test(agency)) continue;
    const name = (inside && !outside ? inside[2] : label).replace(/^[\s|:–-]+|[\s|:–-]+$/g, "").slice(0, 80) || null;
    seen.add(agency);
    out.push({ agency, name, phrase: phrase.replace(/\s+/g, " ").toLowerCase() });
  }
  return out;
}

/** May this credited agency be written to? A network is counted, never pitched. */
export const prospectable = (agency: string) => !PLATFORMS.test(agency) && !NETWORKS.test(agency);
