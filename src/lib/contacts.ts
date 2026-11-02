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
  /**
   * For an email: whose mailbox it is, as far as the page shows. `person` —
   * the local part is a human name, best when it is a named person's on the
   * page; `role` — info@, office@, frontdesk@, which for a three-person salon
   * may well *be* the owner, so kept; `other` — neither. The owner's decision
   * of 2026-10-15: never conflated.
   */
  tier?: EmailTier;
}

export type EmailTier = "person" | "role" | "other";

/** A named person printed on the business's own site, with their role. */
export interface Person {
  name: string;
  /** As printed: "Owner", "Founder & CEO". Null only for "founded by" phrasing. */
  role: string | null;
  /** Their own address, when one on the site is plainly theirs. */
  email: string | null;
  page: string;
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
  /**
   * Owners, founders and managers named on the site (GTM, 2026-11-02: zero of
   * 3,700+ agency prospects carried a person's name). Optional because
   * contacts read before this have none recorded, which is not "nobody".
   */
  people?: Person[];
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

  // People, then whose mailbox each address is. Emails are ordered person,
  // then other, then role, so every surface that takes "the first email" now
  // takes the most personal one without knowing about tiers.
  const people = peopleIn(pages);
  for (const e of emails) e.tier = emailTier(e.value, people);
  for (const person of people) person.email = emailFor(person.name, emails);
  const rank: Record<EmailTier, number> = { person: 0, other: 1, role: 2 };
  emails.sort((a, b) => rank[a.tier ?? "other"] - rank[b.tier ?? "other"]);

  return { emails, phones, contactPage, socials, attribution, withheld: null, people };
}

/* ----------------------------------------------------------------- people -- */

/**
 * Roles that decide whether a small business buys something. Deliberately not
 * "partner" or "director" on their own: "Director of Marketing" and "Partner
 * Network" are not owners, and a wrong name in an opener ("Hi Services,") is
 * worse than none.
 */
const ROLE =
  "(?:co-?)?owner(?:\\s*(?:&|and)\\s*operator)?|proprietor|(?:co-?)?founder(?:\\s*(?:&|and)\\s*(?:ceo|president|owner))?" +
  "|ceo|chief executive officer|president|principal|managing (?:partner|director)" +
  "|general manager|(?:office|practice) manager";

/** Words that are never part of a person's name on a business site. */
const NOT_A_NAME = new Set(
  `
  about all and appointment appointments avenue ave blog book call care careers center centre clinic
  company contact copyright cosmetic customer dental dentistry dds directions dr emergency family find
  first for free from get group heating help here home hours inc llc location locations map meet menu
  more new news now office our owner patient patients plumbing policy president privacy quote read
  request reserved reviews rights road roofing salon schedule service services smile spa staff street
  studio suite team terms testimonials the today welcome with your us we north south east west
  monday tuesday wednesday thursday friday saturday sunday january february march april may june july
  august september october november december founder ceo manager principal proprietor partner director
  cooling air electric fitness gym law firm medical health wellness auto repair construction
  `.trim().split(/\s+/),
);

// O'Brien, McDonald and MacLeod have a capital after the first letter; a plain
// [A-Z][a-z]+ splits or rejects them. Longest alternative first.
const TOKEN = "(?:Ma?c[A-Z][a-z]+|[A-Z]'[A-Z][a-z]+|[A-Z][a-z]+)(?:-[A-Z][a-z]+)?";
const NAME = `(?:Dr\\.?\\s+)?${TOKEN}(?:\\s+[A-Z]\\.)?\\s+${TOKEN}(?:\\s+${TOKEN})?`;
const SUFFIX = "(?:,?\\s+(?:DDS|DMD|MD|DO|DC|DVM|CPA|PE|Esq\\.?|Jr\\.?|Sr\\.?|II|III))?";

/** Patterns, from most to least explicit. `tight` ones need punctuation or a
 *  verb between name and role; the loose one (card layouts, where markup is
 *  gone and only a space separates them) needs a known first name too. */
const PATTERNS: Array<{ re: RegExp; how: string; loose?: boolean; roleFirst?: boolean; by?: boolean }> = [
  { re: new RegExp(`(${NAME})${SUFFIX}\\s*[,–—|(-]\\s*(${ROLE})\\b`, "gi"), how: "printed beside their role" },
  { re: new RegExp(`\\b(${ROLE})\\s*[:–—-]\\s*(${NAME})`, "gi"), how: "printed after their role", roleFirst: true },
  { re: new RegExp(`(${NAME})${SUFFIX}\\s+is\\s+(?:the\\s+|our\\s+)?(${ROLE})\\b`, "gi"), how: "named as the role" },
  { re: new RegExp(`\\b(?:founded|owned(?:\\s+and\\s+operated)?|started)\\s+by\\s+(${NAME})`, "gi"), how: "named as founder or owner", by: true },
  { re: new RegExp(`(${NAME})${SUFFIX}\\s+(${ROLE})\\b`, "gi"), how: "printed beside their role", loose: true },
];

/**
 * A name with a professional credential attached is a named, reachable person
 * even when no page says "owner" — and on dental, medical, vet and accounting
 * sites it is the only way they are named ("Dr. Ahmed Jaheen DDS", "Antonio
 * Cutlatsakes, D.D.S."). Case-sensitive, so "do" is never "DO". MD, DO, DC and
 * OD are also state abbreviations ("Downtown Baltimore, MD"), so those count
 * only after "Dr.".
 */
const CREDENTIAL: Array<{ re: RegExp; role: string; needsDr: boolean }> = [
  { re: /D\.?\s?D\.?\s?S\.?|D\.?\s?M\.?\s?D\.?/, role: "Dentist", needsDr: false },
  { re: /D\.?V\.?M\.?/, role: "Veterinarian", needsDr: false },
  { re: /C\.?P\.?A\.?/, role: "CPA", needsDr: false },
  { re: /Esq\.?/, role: "Attorney", needsDr: false },
  { re: /M\.?D\.?|D\.?O\.?/, role: "Physician", needsDr: true },
  { re: /D\.?C\.?/, role: "Chiropractor", needsDr: true },
  { re: /O\.?D\.?/, role: "Optometrist", needsDr: true },
];
const CREDENTIALED = new RegExp(
  `(${NAME})\\s*,?\\s*(${CREDENTIAL.map((c) => c.re.source).join("|")})(?![A-Za-z])`,
  "g",
);

/** Is this run of capitalised words plausibly a person's name? */
export function plausibleName(raw: string, loose = false): string | null {
  const name = raw.replace(/\s+/g, " ").trim();
  const words = name.replace(/^Dr\.?\s+/i, "").split(" ").filter((w) => !/^[A-Z]\.$/.test(w));
  if (words.length < 2 || words.length > 3) return null;
  if (words.some((w) => NOT_A_NAME.has(w.toLowerCase()) || GENERIC.has(w.toLowerCase()))) return null;
  if (loose && !GIVEN_NAMES.has(words[0].toLowerCase()) && !/^Dr\b/.test(name)) return null;
  return name;
}

/**
 * Is any word of this name used as an ordinary word on the page?
 *
 * A real surname is almost never printed in lower case in a site's own prose;
 * "experienced", "consultation" and "oversight" are. Measured 2026-11-02 on
 * 35 real sites: the credential pattern read "Consultation Experienced, CPA"
 * off a CPA firm's page, and this is what removes it. Lower-case uses inside
 * an address or a URL ("annie.fairchild@…") do not count, and a known first
 * name is exempt, because "Mark" and "Grace" are words too.
 */
function wordOnPage(name: string, text: string): boolean {
  const words = name.replace(/^Dr\.?\s+/i, "").split(" ").filter((w) => !/^[A-Z]\.$/.test(w));
  return words.some((w, i) => {
    const low = w.toLowerCase();
    if (i === 0 && GIVEN_NAMES.has(low)) return false;
    return new RegExp(`(?<![@./\\w-])${low.replace(/[^a-z'-]/g, "")}(?![\\w@])`).test(text);
  });
}

/** Owners, founders and managers named on these pages. At most three. */
export function peopleIn(pages: SitePage[]): Person[] {
  const out: Person[] = [];
  for (const page of pages) {
    // Pattern case-insensitivity is for the role words; the name must still
    // be capitalised as written, so the name is re-checked against TOKEN.
    for (const p of PATTERNS) {
      for (const m of (page.text ?? "").matchAll(p.re)) {
        const rawName = p.by ? m[1] : p.roleFirst ? m[2] : m[1];
        const rawRole = p.by ? null : p.roleFirst ? m[1] : m[2];
        // The role words need a case-insensitive match, which lets the name
        // pattern swallow a neighbour ("team Maria Lopez", "James O'Brien
        // Call"). So the 2- and 3-word spans **nearest the role** are tried,
        // each re-checked case-sensitively.
        const name = nearestName(rawName, p.roleFirst || p.by ? "start" : "end", p.loose);
        if (!name || wordOnPage(name, page.text ?? "")) continue;
        if (out.some((x) => x.name.toLowerCase() === name.toLowerCase())) continue;
        out.push({
          name,
          role: rawRole ? tidyRole(rawRole) : "Founder or owner",
          email: null,
          page: page.url ?? "",
          how: p.how,
        });
        if (out.length >= 3) return out;
      }
    }
    for (const m of (page.text ?? "").matchAll(CREDENTIALED)) {
      const cred = CREDENTIAL.find((c) => new RegExp(`^(?:${c.re.source})$`).test(m[2].trim()));
      if (!cred) continue;
      const name = nearestName(m[1], "end");
      if (!name || (cred.needsDr && !/^Dr\b/.test(name)) || wordOnPage(name, page.text ?? "")) continue;
      if (out.some((x) => x.name.toLowerCase().replace(/^dr\.?\s+/, "") === name.toLowerCase().replace(/^dr\.?\s+/, ""))) continue;
      out.push({ name, role: cred.role, email: null, page: page.url ?? "", how: "printed with their credential" });
      if (out.length >= 3) return out;
    }
  }
  return out;
}

function nearestName(raw: string, side: "start" | "end", loose = false): string | null {
  const exact = new RegExp(`^${NAME}$`);
  const words = raw.replace(/\s+/g, " ").trim().split(" ");
  const dr = /^Dr\.?$/.test(words[0]);
  for (const n of [2, 3, 4]) {
    if (n > words.length) break;
    const span = side === "start" ? words.slice(0, n) : words.slice(words.length - n);
    // Keep "Dr." when the span starts right after it.
    const text = (side === "end" && dr && span.length === words.length - 1 ? "Dr. " : "") + span.join(" ");
    if (!exact.test(text)) continue;
    const ok = plausibleName(text, loose);
    if (ok) return ok;
  }
  return null;
}

const tidyRole = (r: string) =>
  r
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(ceo)\b/gi, "CEO")
    .replace(/^./, (c) => c.toUpperCase());

/** Mailboxes that belong to a function, not a person. */
const ROLE_MAILBOX =
  /^(info|hello|hi|office|frontdesk|front\.desk|reception|contact|contactus|admin|appointments?|bookings?|schedul\w*|sales|support|team|help|service|enquiries|inquiries|mail|email|general|billing|accounts?|marketing|hr|jobs|careers|clinic|care|customerservice|orders|estimates?|quotes?)$/i;

const localOf = (email: string) => email.split("@")[0].toLowerCase();

/** The address on the page that is plainly this person's, if any. */
export function emailFor(name: string, emails: Published[]): string | null {
  const words = name.replace(/^Dr\.?\s+/i, "").toLowerCase().split(" ").filter((w) => !/^[a-z]\.$/.test(w));
  const first = words[0];
  const last = words[words.length - 1];
  const forms = [first, last, `${first}.${last}`, `${first}${last}`, `${first[0]}${last}`, `${first}_${last}`, `${first[0]}.${last}`]
    .filter((f) => f.length >= 3);
  const hit = emails.find((e) => {
    const local = localOf(e.value).replace(/[0-9]+$/, "");
    return forms.includes(local);
  });
  return hit?.value ?? null;
}

/** Whose mailbox an address is. */
export function emailTier(email: string, people: Person[]): EmailTier {
  const local = localOf(email).replace(/[0-9]+$/, "");
  if (ROLE_MAILBOX.test(local)) return "role";
  if (people.some((p) => emailFor(p.name, [{ value: email, page: "", how: "" }]))) return "person";
  // A local part that is a first name, or first.last, is a person's mailbox
  // even when the page does not name them.
  const parts = local.split(/[._-]/);
  if (GIVEN_NAMES.has(parts[0]) && parts.length <= 2) return "person";
  // first.last is the convention for a person's own mailbox, whatever the
  // first name is: "rob.gerwing@" is somebody, "info@" is a desk.
  if (/^[a-z]{2,}[._][a-z]{2,}$/.test(local)) return "person";
  return "other";
}

/** Is there a way to reach this business that we actually found? */
export const reachable = (c: SiteContacts): boolean =>
  c.emails.length > 0 || c.phones.length > 0 || c.contactPage !== null;
