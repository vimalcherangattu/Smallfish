/**
 * Contacts published on a business's own site, read while we are already there.
 *
 * ## Why this is a port and not a new idea
 *
 * `stage0/src/coverage/extract_contacts.py` has done this since S1-05 and
 * produced the four `public/data/contacts-*.json` files the measured markets
 * serve. **The live read did none of it.** `read.ts` fetched the pages, judged
 * the criterion and threw the text away, so every job — which is to say every
 * cold city, which is to say everything this product can now search — came
 * back with the phone Overture listed and nothing else. No email, ever.
 *
 * That is the half the owner's model rests on (2026-10-08): we always read, a
 * credit is charged when we have read the site and it matches, and when there
 * is nothing to match against, what makes a row worth paying for is that we
 * got usable contact details off it.
 *
 * So the rules here are transcribed rather than reinvented, because each one
 * is a bug somebody already found:
 *
 *   - **A number needs more than a regex.** It must either match the phone on
 *     the listing, or be printed beside a word like "call" **and share the
 *     listing's area code**. That last clause is what caught "Crain David A
 *     Dds", a Phoenix practice whose Overture record points at `ihs.gov`: the
 *     page is a federal health portal and the number beside "call" is a
 *     Maryland one.
 *   - **A first name is not distinctive.** The same record passed the
 *     attribution test because "david" appears on a federal health portal.
 *     Surnames stay, because "ferguson" is what rescues `drfergusonaz.com`.
 *   - **A town on its own is not attribution.** Every national site with a
 *     branch in Phoenix says "Phoenix". A town match is returned as
 *     `town-only` and travels with the contact as a caveat rather than being
 *     silently trusted or silently dropped.
 *
 * Measured on the 570 dental businesses whose site was read: 85% are named on
 * their own site, 83% mention their town, 93% do one or the other.
 *
 * `test_contacts.mjs` asserts the two word lists against the Python source
 * character for character, so the port cannot drift away from the thing it
 * was ported from.
 */

/** Words too common in a trade name to attribute a page to one business. */
export const GENERIC = new Set(
  `
  aesthetics air and associates beauty care center centre clinic co company
  conditioning cooling corp dental dentist dentistry electric family group health
  heating inc llc med medical office plumbing practice service services smile smiles
  solutions spa systems the wellness
`.trim().split(/\s+/),
);

/**
 * First names, excluded from attribution.
 *
 * Treating one as distinctive is exactly how `ihs.gov` passed for "Crain David
 * A Dds". Surnames are kept.
 */
export const GIVEN_NAMES = new Set(
  `
  aaron abigail adam alan albert alexander alexis alice amanda amber amy andrea andrew
  angela ann anna anthony arthur ashley austin barbara benjamin betty beverly billy
  bobby bradley brandon brenda brian brittany bruce bryan carl carol carolyn catherine
  charles cheryl christian christina christine christopher cynthia daniel danielle
  david deborah debra denise dennis diana diane donald donna doris dorothy douglas
  dylan edward elijah elizabeth emily emma eric ethan eugene evelyn frances frank
  gabriel gary george gerald gloria grace gregory hannah harold heather henry jack
  jacob jacqueline james jane janet janice jason jean jeffrey jennifer jeremy jerry
  jesse jessica joan joe john jonathan jordan jose joseph joshua joyce juan judith
  judy julia julie justin karen katherine kathleen kathryn kayla keith kelly kenneth
  kevin kimberly kyle larry laura lauren lawrence linda lisa logan lori madison
  margaret maria marie marilyn mark martha mary mason matthew megan melissa michael
  michelle nancy natalie nathan nicholas nicole noah olivia pamela patricia patrick
  paul peter philip rachel ralph randy raymond rebecca richard robert roger ronald
  rose roy russell ruth ryan samantha samuel sandra sara sarah scott sean sharon
  shirley sophia stephanie stephen steven susan teresa terry theresa thomas timothy
  tyler victoria vincent virginia walter wayne william willie zachary
`.trim().split(/\s+/),
);

const EMAIL = /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g;
const EMAIL_ONE = /^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$/;
const PHONE = /(?:\+1[ .\-]?)?\(?(\d{3})\)?[ .\-]?(\d{3})[ .\-]?(\d{4})/g;
const CUE = /(call|phone|tel|text|dial|reach us|contact)/i;

/** Addresses that are never a business's own published contact. */
const EMAIL_NOISE =
  /(@(example|sentry|wix|squarespace|godaddy|sentry\.io|2x|3x)\b|\.(png|jpg|jpeg|gif|webp|svg|css|js)$|^(noreply|no-reply|donotreply)@)/i;

/** A run of digits is only a phone if it could be one. */
const BAD_AREA = new Set(["000", "111", "555", "123"]);

const SOCIAL_HOSTS = [
  "facebook.com", "instagram.com", "linkedin.com", "twitter.com", "x.com",
  "youtube.com", "tiktok.com", "yelp.com",
];

export interface Published {
  value: string;
  /** The page it was found on, so a person can go and check. */
  page: string;
  /** How it was confirmed. Never "a regex matched". */
  how: string;
}

export interface SiteContacts {
  emails: Published[];
  phones: Published[];
  contactPage: string | null;
  socials: Published[];
  /** Set when the page cannot be attributed to this business at all. */
  withheld: string | null;
  /** "named" | "town-only" | null — how the page was attributed. */
  attribution: "named" | "town-only" | null;
}

export interface SitePage {
  url: string;
  text: string;
  links?: string[];
}

/** Addresses printed in the page text. */
export function emailsIn(text: string): string[] {
  const out: string[] = [];
  for (const m of (text ?? "").matchAll(EMAIL)) {
    const addr = m[0].replace(/[.,;:]+$/, "");
    if (EMAIL_NOISE.test(addr)) continue;
    if (!out.some((a) => a.toLowerCase() === addr.toLowerCase())) out.push(addr);
  }
  return out;
}

/**
 * Numbers printed in the page text, each with how it was confirmed.
 *
 * Never the regex alone. A local business's own published number is in its own
 * area code; a number in a different one is a chain line, a vendor, or
 * somebody else's site entirely.
 */
export function phonesIn(text: string, known: string | null): Array<{ value: string; how: string }> {
  const knownDigits = (known ?? "").replace(/\D/g, "").slice(-10);
  const out: Array<{ value: string; how: string }> = [];
  const seen = new Set<string>();
  for (const m of (text ?? "").matchAll(PHONE)) {
    const [, area, mid, last] = m;
    if (BAD_AREA.has(area) || area.startsWith("0") || area.startsWith("1")) continue;
    const num = `${area}${mid}${last}`;
    if (seen.has(num)) continue;
    const at = m.index ?? 0;
    const window = text.slice(Math.max(0, at - 60), at);
    let how: string;
    if (knownDigits && num === knownDigits) {
      how = "matches the phone on the business listing";
    } else if (!CUE.test(window)) {
      continue;
    } else if (knownDigits && area !== knownDigits.slice(0, 3)) {
      continue; // a different area code is not this local business's line
    } else {
      how = "printed next to a word like call or phone";
    }
    seen.add(num);
    out.push({ value: `(${num.slice(0, 3)}) ${num.slice(3, 6)}-${num.slice(6)}`, how });
  }
  return out;
}

/** Name words distinctive enough to attribute a page by. */
export const distinctive = (name: string): string[] => [
  ...new Set(
    (name ?? "").toLowerCase().match(/[a-z]{4,}/g)?.filter((w) => !GENERIC.has(w) && !GIVEN_NAMES.has(w)) ?? [],
  ),
];

/** The town out of a freeform address, when there is one. */
export const cityOf = (addr: string | null | undefined): string => {
  const parts = (addr ?? "").split(",").map((p) => p.trim().toLowerCase());
  return parts.length >= 3 ? parts[parts.length - 2] : "";
};

const hostOf = (url: string | null | undefined): string =>
  (url ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");

/**
 * Does this site look like it is actually this business's?
 *
 * Deliberately weak: it only has to catch the obvious. A distinctive word from
 * the name, or the town, appearing in the page text or the domain.
 */
export function attributionOf(
  business: { name?: string | null; addr?: string | null; site?: string | null },
  pages: SitePage[],
): "named" | "town-only" | null {
  const words = distinctive(business.name ?? "");
  const city = cityOf(business.addr);
  const domain = hostOf(business.site);
  const blob = pages.map((p) => p.text ?? "").join(" ").toLowerCase();
  const hays = [blob, domain.replace(/-/g, "")];
  for (const hay of hays) if (words.length && words.some((w) => hay.includes(w))) return "named";
  for (const hay of hays) {
    if (city && hay.replace(/ /g, "").includes(city.replace(/ /g, ""))) return "town-only";
  }
  return null;
}

/**
 * Every published contact in one site read.
 *
 * `withheld` rather than empty when the page cannot be attributed: "we could
 * not tell this page is yours" and "this business publishes nothing" are
 * different answers, and printing a stranger's phone number beside somebody's
 * name is the failure this guards against.
 */
export function contactsFrom(args: {
  pages: SitePage[];
  business: { name?: string | null; addr?: string | null; site?: string | null };
  /** The phone on the listing, which is what a page number is checked against. */
  listedPhone?: string | null;
}): SiteContacts {
  const { pages, business } = args;
  const attribution = attributionOf(business, pages);

  if (attribution === null) {
    return {
      emails: [], phones: [], contactPage: null, socials: [],
      attribution: null,
      withheld:
        `Nothing on ${hostOf(business.site) || "that site"} names this business or its town, ` +
        `so we cannot tell the page belongs to them. Anything published on it ` +
        `might be somebody else's.`,
    };
  }

  const emails: Published[] = [];
  const phones: Published[] = [];
  const socials: Published[] = [];
  let contactPage: string | null = null;

  for (const page of pages) {
    const text = page.text ?? "";
    const url = page.url ?? "";
    for (const link of page.links ?? []) {
      const low = link.toLowerCase();
      if (low.startsWith("mailto:")) {
        const addr = link.slice(7).split("?")[0].trim();
        if (EMAIL_ONE.test(addr) && !EMAIL_NOISE.test(addr)) {
          if (!emails.some((e) => e.value.toLowerCase() === addr.toLowerCase())) {
            emails.push({ value: addr, page: url, how: "linked as mailto:" });
          }
        }
      } else if (SOCIAL_HOSTS.some((h) => low.includes(`//${h}`) || low.includes(`.${h}`))) {
        if (!socials.some((s) => s.value === link)) {
          socials.push({ value: link, page: url, how: "linked from the page" });
        }
      }
    }
    for (const addr of emailsIn(text)) {
      if (!emails.some((e) => e.value.toLowerCase() === addr.toLowerCase())) {
        emails.push({ value: addr, page: url, how: "printed on the page" });
      }
    }
    for (const { value, how } of phonesIn(text, args.listedPhone ?? null)) {
      if (!phones.some((p) => p.value === value)) phones.push({ value, page: url, how });
    }
    if (contactPage === null && /\/contact|\/get-in-touch|\/reach/i.test(url)) contactPage = url;
  }

  return { emails, phones, contactPage, socials, attribution, withheld: null };
}

/** Is there a way to reach this business that we actually found? */
export const reachable = (c: SiteContacts): boolean =>
  c.emails.length > 0 || c.phones.length > 0 || c.contactPage !== null;
