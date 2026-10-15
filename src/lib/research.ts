/**
 * Who to write to, sized before anything is bought (GTM, 2026-10-15).
 *
 * The owner's call: the buyer is not the small business, it is the company a
 * little larger that **sells to** small businesses, and the person there, not
 * `info@`. Measured on the first 4,781 agencies read: of 85 with an address,
 * 54 were role addresses (64%). So the people come from Instantly SuperSearch,
 * which carries named contacts with verified work addresses, and the engine
 * keeps doing what only it can: reading the company's own site for the trade
 * it sells to, and building that trade's list in the contact's city.
 *
 * `count-leads-from-supersearch` costs no credits. Each segment here is
 * counted on the daily run and logged as `research_count`, so the choice of
 * audience is made from numbers, not from a guess about the database.
 */

const SMB_WORDS =
  "small business, small businesses, local businesses, SMB, dental practices, dentists, contractors, " +
  "home services, med spas, restaurants, law firms, HVAC, plumbers, roofers, salons, clinics";

// PRD v2 (2026-10-15): the buyer is "a founder, solo seller or small sales
// team selling to US small businesses". So small companies, and the founder
// or owner first.
const LEADERS = [
  "Owner", "Founder", "Co-Founder", "CEO", "President",
  "VP Sales", "Head of Sales", "Director of Sales", "Sales Director", "VP of Sales",
  "Head of Growth", "VP Growth", "Head of Business Development", "VP Business Development",
  "Head of Marketing", "VP Marketing", "Director of Demand Generation", "Head of Revenue",
  "Chief Revenue Officer",
];

export interface Segment {
  id: string;
  what: string;
  filters: Record<string, unknown>;
}

const base = {
  employeeCount: ["0 - 25", "25 - 100"],
  title: { include: LEADERS },
  keyword_filter: { include: SMB_WORDS, include_mode: "ANY" },
  locations: [{ country: "United States" }],
  location_mode: "company",
  skip_owned_leads: true,
  show_one_lead_per_company: true,
};

export const SEGMENTS: Segment[] = [
  {
    id: "smb-sellers-hiring-reps",
    what: "under 100 staff, sell to small or local businesses, hiring SDRs or AEs now; founder or sales lead",
    filters: {
      ...base,
      industry: { include: ["Software & Internet", "Business Services", "Financial Services", "Telecommunications", "Wholesale & Distribution"] },
      jobListing: ["Sales Development Representative", "Business Development Representative", "Account Executive"],
    },
  },
  {
    id: "smb-sellers",
    what: "the same companies, hiring or not",
    filters: {
      ...base,
      industry: { include: ["Software & Internet", "Business Services", "Financial Services", "Telecommunications", "Wholesale & Distribution"] },
    },
  },
  {
    id: "smb-agencies-25plus",
    what: "marketing agencies under 100 staff serving small or local businesses; founder or head of growth",
    filters: {
      ...base,
      industry: { include: ["Business Services", "Media & Entertainment"] },
      keyword_filter: { include: "marketing agency, digital agency, SEO agency, " + SMB_WORDS, include_mode: "ANY" },
    },
  },
];

/** Named people at agencies we already read, for the ones whose site only
 *  published `info@`. */
export function ownersAt(domains: string[]): Segment {
  return {
    id: "owners-at-read-agencies",
    what: `founders and owners at ${domains.length} agencies the finder already read`,
    filters: {
      domains,
      title: { include: ["Founder", "Co-Founder", "Owner", "CEO", "President", "Managing Director", "Partner"] },
      show_one_lead_per_company: true,
    },
  };
}

/**
 * One search per trade, so every contact arrives with the trade its company
 * sells to, and no credit is spent on a company we could not write a
 * specific email to. Hiring-reps first: the sharpest signal that a sales team
 * needs lists now.
 */
const TRADE_WORDS: Record<string, string> = {
  dental: "dental practices, dentists, dental offices, orthodontists",
  medspa: "med spas, medical spas, aesthetic clinics, medspa",
  hvac: "HVAC, home services, contractors, plumbers, roofers",
  legal: "law firms, attorneys, lawyers, legal practices",
  restaurant: "restaurants, restaurant owners, hospitality",
  realestate: "real estate agents, realtors, brokerages",
  salon: "salons, spas, beauty salons, barbershops",
  chiro: "chiropractors, physical therapists, wellness clinics",
  vet: "veterinary clinics, veterinarians, animal hospitals",
};

export function tradeSegments(): Array<Segment & { niche: string }> {
  // The PRD's sellers: booking software, POS, payroll, web design, agencies,
  // insurance, cleaning supplies.
  const sellers = ["Software & Internet", "Business Services", "Financial Services", "Telecommunications", "Wholesale & Distribution"];
  const out: Array<Segment & { niche: string }> = [];
  for (const hiring of [true, false]) {
    for (const [niche, words] of Object.entries(TRADE_WORDS)) {
      out.push({
        id: `seller-${niche}${hiring ? "-hiring" : ""}`,
        niche,
        what: `companies selling to ${niche}${hiring ? ", hiring reps now" : ""}`,
        filters: {
          ...base,
          industry: { include: sellers },
          keyword_filter: { include: words, include_mode: "ANY" },
          ...(hiring ? { jobListing: ["Sales Development Representative", "Business Development Representative", "Account Executive"] } : {}),
        },
      });
    }
  }
  return out;
}
