/**
 * Where a matched row can be sent, and what each destination refuses (S2-02).
 *
 * HubSpot, Instantly, Smartlead and a plain signed webhook. This module holds
 * the part that has to be right regardless of which HTTP call carries it:
 * what leaves, what it looks like on the other side, and what is refused
 * out loud. `deliver.ts` makes the requests.
 *
 * ## The two things this gets wrong by default
 *
 * **We do not have email addresses.** Overture Places gives a name, an address,
 * a phone number and a website. S1-05 publishes a contact when a business puts
 * one on its own site, and that is the only email any row ever carries. So the
 * two sending tools in the list — Instantly and Smartlead — cannot be handed a
 * lead at all without one, because a lead with no email is not a record either
 * API will accept.
 *
 * This is worth stating plainly because the GTM plan lists "sender
 * integrations" as though they were the same shape as a CRM sync, and they are
 * not: a CRM will take a company record with a domain and no person, and a
 * sequencer will not. What ships here is therefore a **bring-your-own-address**
 * path — rows go to a sequencer only where the customer already holds an
 * address for that business — and the rest are refused with a count, in the
 * same voice the verdicts use. Not "0 leads added". "128 of 186 have no email
 * address; we do not hold one and did not invent one."
 *
 * **A sequencer sends what you give it.** That makes it categorically different
 * from the CSV, where `outreach.ts`'s refusal travels in its own column and a
 * human reads it. A merge variable goes into a message addressed to a real
 * business without anyone reading it first, so a row whose icebreaker could not
 * be written honestly is refused for a sender rather than pushed with the field
 * blank — an empty variable renders as "Hi, I noticed" and stops mid-sentence.
 * For HubSpot and the webhook, nothing auto-sends, so the reason travels with
 * the row exactly as it does in the file.
 *
 * ## The rule the evidence imposes
 *
 * A row in a CRM that has lost its proof is a row the customer cannot defend,
 * which is the one thing this product exists not to ship. So evidence is not
 * "nice to have if the destination has a field for it": a destination that
 * cannot carry it is refused before the first row is sent. For HubSpot that
 * means the custom properties have to exist on the portal first — see
 * `HUBSPOT_PROPERTIES` and `missingProperties`, and the preflight in
 * `deliver.ts` that refuses the whole push rather than silently creating
 * companies with no reason attached.
 */

import { groupForBilling } from "@/lib/billing";
import { whyItMatched } from "@/lib/csv";
import { type Entitlement, type Refusal, entitled } from "@/lib/entitlement";
import { domainOf, outreachFor } from "@/lib/outreach";
import type { Business, Criterion } from "@/lib/types";

// --------------------------------------------------------- the catalogue --

export type DestinationKind = "hubspot" | "instantly" | "smartlead" | "webhook";

export interface DestinationSpec {
  kind: DestinationKind;
  label: string;
  /** Does arriving here put the row in front of a recipient without a human
   *  reading it first? The rule about withheld openers hangs off this. */
  sends: boolean;
  /** Does its record require an email address? We hold one only when the
   *  business published one (S1-05) or the customer supplied it. */
  requiresEmail: boolean;
  /** A campaign, list or endpoint the customer has to name. */
  target: "campaign" | "endpoint" | null;
  /** What has to exist on their side before evidence can travel. */
  setup: string | null;
  docs: string;
}

export const DESTINATIONS: Record<DestinationKind, DestinationSpec> = {
  hubspot: {
    kind: "hubspot",
    label: "HubSpot",
    sends: false,
    requiresEmail: false,
    target: null,
    setup:
      "Nine company properties hold the evidence. Small Fish creates them on " +
      "first connect if the private app has the schema scope, and refuses the " +
      "push if they are missing — a company record with no reason on it is a " +
      "row you cannot defend.",
    docs: "https://developers.hubspot.com/docs/api/crm/companies",
  },
  instantly: {
    kind: "instantly",
    label: "Instantly",
    sends: true,
    requiresEmail: true,
    target: "campaign",
    setup: null,
    docs: "https://developer.instantly.ai/api/v2/lead",
  },
  smartlead: {
    kind: "smartlead",
    label: "Smartlead",
    sends: true,
    requiresEmail: true,
    target: "campaign",
    setup: null,
    docs: "https://api.smartlead.ai/reference/add-leads-to-a-campaign",
  },
  webhook: {
    kind: "webhook",
    label: "Webhook",
    sends: false,
    requiresEmail: false,
    target: "endpoint",
    setup:
      "Each delivery is signed. Verify the `X-Smallfish-Signature` header " +
      "before trusting the body — an unsigned endpoint is an open door to " +
      "anyone who learns the URL.",
    docs: "/docs/integrations",
  },
};

export const DESTINATION_KINDS = Object.keys(DESTINATIONS) as DestinationKind[];

export const isDestinationKind = (s: string): s is DestinationKind =>
  Object.prototype.hasOwnProperty.call(DESTINATIONS, s);

// ------------------------------------------------------------- the row --

/** One business, in a shape no destination owns.
 *
 *  The mapping to HubSpot properties or Instantly variables happens after
 *  this, so that a new destination is a function rather than a second pass
 *  over the market data with its own idea of what a match is. */
export interface PushRow {
  businessId: string;
  name: string;
  category: string;
  address: string;
  domain: string | null;
  website: string | null;
  phone: string | null;
  /** Only ever a published address (S1-05) or one the customer already had.
   *  Never guessed, never patterned from the domain. */
  email: string | null;
  lat: number;
  lon: number;
  /** How many listings this one row stands for — `billing.ts` groups branches
   *  so a chain is one row and one credit, not twenty-three of each. */
  locations: number;
  matched: { criterion: string; proof: string; howChecked: string }[];
  whyItMatched: string;
  painPoint: string | null;
  icebreaker: string | null;
  note: string | null;
  /** The evidence the note rests on — or, when none could be written, why. */
  basis: string[];
  withheld: string | null;
  pagesRead: number;
  readOutcome: string;
  technology: string[];
  source: string;
}

const SOURCE = "Overture Maps + site read by Small Fish";

export function toPushRows(
  businesses: Business[],
  criteria: Criterion[],
  opts: {
    ent?: Entitlement;
    /** Addresses the customer already holds, or that S1-05 found published on
     *  the business's own site. Keyed by business id. */
    emails?: Record<string, string>;
  } = {},
): { rows: PushRow[]; refused: Refusal[] } {
  const { rows: allowed, refused } = entitled(businesses, criteria, opts.ent ?? {});

  // One row per business, for the same reason the CSV does it: 23 Phoenix
  // listings share aspendental.com, and twenty-three near-identical companies
  // in someone's CRM is a mess they have to clean up by hand.
  const groups = groupForBilling(allowed);

  const rows = groups.map(({ lead, all }): PushRow => {
    const o = outreachFor(lead, criteria);
    const matched = criteria
      .filter((c) => lead.verdicts[c.id]?.verdict === "match")
      .map((c) => ({
        criterion: c.text,
        proof: lead.verdicts[c.id]?.proof ?? lead.verdicts[c.id]?.reason ?? "",
        howChecked: c.explain,
      }));

    return {
      businessId: lead.id,
      name: lead.name,
      category: lead.cat,
      address: lead.addr,
      domain: domainOf(lead.site),
      website: lead.site,
      phone: lead.phone,
      email: opts.emails?.[lead.id] ?? null,
      lat: lead.lat,
      lon: lead.lon,
      locations: all.length,
      matched,
      whyItMatched: whyItMatched(lead, criteria),
      painPoint: o.painPoint,
      icebreaker: o.icebreaker,
      note: o.note,
      basis: o.basis,
      withheld: o.withheld,
      pagesRead: lead.read?.pages ?? 0,
      readOutcome: lead.read?.outcome ?? "not read",
      technology: lead.read?.vendors ?? [],
      source: SOURCE,
    };
  });

  // The branches that rode on a lead's row are not counted as refusals.
  // Nothing was withheld — the row covers them, and `locations` says how many.
  // Reporting them as refused would tell the customer data was held back when
  // it was merged.
  return { rows, refused };
}

// ----------------------------------------------- destination-side refusals --

export type PushRefusalCode = "no_email" | "no_defensible_opener" | "no_domain";

export interface PushRefusal {
  businessId: string;
  code: PushRefusalCode;
  reason: string;
}

/**
 * Which of these rows this particular destination can take, and why not.
 *
 * Every refusal here is a case where sending anyway would produce something
 * worse than sending nothing: a lead with no address that the API rejects, an
 * email that opens mid-sentence, a company record with no way to find it again.
 */
export function prepare(
  kind: DestinationKind,
  rows: PushRow[],
): { ready: PushRow[]; refused: PushRefusal[] } {
  const spec = DESTINATIONS[kind];
  const ready: PushRow[] = [];
  const refused: PushRefusal[] = [];

  for (const r of rows) {
    if (spec.requiresEmail && !r.email) {
      refused.push({
        businessId: r.businessId,
        code: "no_email",
        reason:
          `${spec.label} needs an email address and we do not hold one for this ` +
          "business. We will not guess one from the domain — a guessed address " +
          "is a bounce against your sending reputation, or worse, a real " +
          "person who never asked to hear from you.",
      });
      continue;
    }

    // Only for destinations that send. In a CSV or a CRM the refusal is
    // information: "no opener could be written, here is why", read by a human
    // before anything goes out. In a sequencer the same blank is an email.
    if (spec.sends && (r.withheld || !r.icebreaker)) {
      refused.push({
        businessId: r.businessId,
        code: "no_defensible_opener",
        reason:
          `No opening line could be written from evidence (${r.withheld ?? "no opener"}), ` +
          `and ${spec.label} would send the message without anyone reading it first.`,
      });
      continue;
    }

    if (kind === "hubspot" && !r.domain) {
      refused.push({
        businessId: r.businessId,
        code: "no_domain",
        reason:
          "No website, so there is nothing for HubSpot to key a company record " +
          "on and nothing to merge it against later.",
      });
      continue;
    }

    ready.push(r);
  }

  return { ready, refused };
}

// ---------------------------------------------------------------- HubSpot --

/**
 * The company properties the evidence needs.
 *
 * `smallfish_business_id` is unique and is what a re-push keys on. **Not
 * `domain`**, deliberately: `billing.ts` already groups branches by host, and a
 * customer whose portal keys on domain would have one Aspen Dental company for
 * twenty-three practices. The domain is set as well, so HubSpot's own duplicate
 * management can offer a merge — that is the customer's call, not ours.
 */
export const HUBSPOT_PROPERTIES = [
  {
    name: "smallfish_business_id",
    label: "Small Fish ID",
    type: "string",
    fieldType: "text",
    hasUniqueValue: true,
    description: "Stable id for this business. What a re-push updates instead of duplicating.",
  },
  {
    name: "smallfish_why_matched",
    label: "Why it matched",
    type: "string",
    fieldType: "textarea",
    description: "One sentence, quoting the evidence.",
  },
  {
    name: "smallfish_evidence",
    label: "Evidence",
    type: "string",
    fieldType: "textarea",
    description: "What was found on the site, per criterion.",
  },
  {
    name: "smallfish_how_checked",
    label: "How it was checked",
    type: "string",
    fieldType: "textarea",
    description: "The check that produced each verdict.",
  },
  {
    name: "smallfish_icebreaker",
    label: "Icebreaker",
    type: "string",
    fieldType: "textarea",
    description: "An opener citing something checkable, or the reason none was written.",
  },
  {
    name: "smallfish_pain_point",
    label: "Likely pain point",
    type: "string",
    fieldType: "textarea",
    description: "What the observed gap plausibly costs them. The gap was observed; the cost was not.",
  },
  {
    name: "smallfish_pages_read",
    label: "Pages read",
    type: "number",
    fieldType: "number",
    description: "How much of the site was actually read. Zero means nothing was.",
  },
  {
    name: "smallfish_locations",
    label: "Locations covered",
    type: "number",
    fieldType: "number",
    description: "Listings this record stands for. More than one means branches.",
  },
  {
    name: "smallfish_source",
    label: "Source",
    type: "string",
    fieldType: "text",
    description: "Where the record and its evidence came from.",
  },
] as const;

export const HUBSPOT_GROUP = "smallfish";

/** Property names the portal is missing. The push refuses on a non-empty list. */
export function missingProperties(existing: Iterable<string>): string[] {
  const have = new Set(existing);
  return HUBSPOT_PROPERTIES.map((p) => p.name).filter((n) => !have.has(n));
}

/** A line per matched criterion, joined for a textarea. */
const evidenceLines = (r: PushRow) =>
  r.matched.map((m) => `${m.criterion} — ${m.proof}`).join("\n");

const howCheckedLines = (r: PushRow) =>
  r.matched.map((m) => `${m.criterion}: ${m.howChecked}`).join("\n");

/**
 * The batch upsert body.
 *
 * `idProperty` makes a second push an update rather than a second company,
 * which matters more here than in a CSV: a duplicate row in a file is an
 * annoyance, a duplicate company in a CRM breaks the customer's reporting.
 */
export function hubspotUpsertBody(rows: PushRow[]) {
  return {
    inputs: rows.map((r) => ({
      idProperty: "smallfish_business_id",
      id: r.businessId,
      properties: {
        name: r.name,
        domain: r.domain ?? "",
        phone: r.phone ?? "",
        address: r.address,
        smallfish_business_id: r.businessId,
        smallfish_why_matched: r.whyItMatched,
        smallfish_evidence: evidenceLines(r),
        smallfish_how_checked: howCheckedLines(r),
        // The refusal travels, clearly marked. Nothing here is auto-sent, and
        // a salesperson who opens the record should see why there is no opener
        // rather than an empty field they might assume is a bug.
        smallfish_icebreaker: r.icebreaker ?? `No opener written: ${r.withheld ?? "unknown"}`,
        smallfish_pain_point: r.painPoint ?? "",
        smallfish_pages_read: r.pagesRead,
        smallfish_locations: r.locations,
        smallfish_source: r.source,
      },
    })),
  };
}

// -------------------------------------------------------------- sequencers --

/** Merge variables for a tool that will send them.
 *
 *  Only fields that survived `prepare` reach this, so there is no withheld
 *  reason to leak into a message — `assertNoRefusalText` is the belt to that
 *  braces, and the tests run it over every sender payload. */
function senderVariables(r: PushRow) {
  return {
    sf_icebreaker: r.icebreaker ?? "",
    sf_why_matched: r.whyItMatched,
    sf_evidence: evidenceLines(r),
    sf_pain_point: r.painPoint ?? "",
    sf_website: r.website ?? "",
    sf_phone: r.phone ?? "",
    sf_source: r.source,
  };
}

export function instantlyBodies(rows: PushRow[], campaign: string) {
  // One request per lead: Instantly's v2 lead endpoint takes a single lead, and
  // batching it ourselves by pretending otherwise would fail on the first row
  // and leave the rest in an unknown state.
  return rows.map((r) => ({
    campaign,
    email: r.email,
    company_name: r.name,
    website: r.website ?? undefined,
    phone: r.phone ?? undefined,
    custom_variables: senderVariables(r),
  }));
}

export function smartleadBody(rows: PushRow[]) {
  return {
    lead_list: rows.map((r) => ({
      email: r.email,
      company_name: r.name,
      website: r.website ?? undefined,
      phone_number: r.phone ?? undefined,
      custom_fields: senderVariables(r),
    })),
  };
}

/**
 * Nothing in a payload bound for a sending tool may read like a refusal.
 *
 * `outreach.ts` writes "not written: the site was not readable" and the CSV
 * puts that in its own column. If one ever reaches a merge variable it becomes
 * the first line of an email to a real business. `prepare` already refuses
 * those rows; this is the check that the refusal actually happened, and it runs
 * in the delivery path rather than only in the tests.
 */
export function assertNoRefusalText(payload: unknown): void {
  const seen = JSON.stringify(payload ?? "");
  const tells = [/not written:/i, /No opener written:/i, /couldn'?t tell/i];
  for (const t of tells) {
    if (t.test(seen)) {
      throw new Error(
        `Refusal text reached a payload bound for a sending tool (${t}). ` +
          "This would have been sent to a business as the opening line of an email.",
      );
    }
  }
}

// ---------------------------------------------------------------- webhook --

export const WEBHOOK_VERSION = 1;

/** The body a customer's endpoint receives. Versioned, because the day a field
 *  is renamed their parser should fail loudly rather than read undefined. */
export function webhookBody(args: {
  marketId: string;
  criteria: Criterion[];
  rows: PushRow[];
  refused: (Refusal | PushRefusal)[];
  sentAt: string;
}) {
  return {
    version: WEBHOOK_VERSION,
    sentAt: args.sentAt,
    market: args.marketId,
    criteria: args.criteria.map((c) => ({ id: c.id, text: c.text, howChecked: c.explain })),
    rows: args.rows,
    // Counts and reasons, no identities — the same split the CSV makes. A
    // webhook that shipped the refused businesses' names would be a way to
    // take a market's contact list by asking for a criterion nothing matches.
    refused: Object.entries(
      args.refused.reduce<Record<string, number>>((acc, r) => {
        acc[r.reason] = (acc[r.reason] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([reason, count]) => ({ reason, count })),
  };
}

// ------------------------------------------------------------ what to say --

/** The sentence shown after a push. Counts first, then every reason.
 *
 *  It says what did not go and why, always — a push that reports only its
 *  successes is the CRM version of an export that silently drops rows. */
export function pushSummary(args: {
  destination: DestinationSpec;
  sent: number;
  refused: (Refusal | PushRefusal)[];
}): string {
  const head = `${args.sent} row${args.sent === 1 ? "" : "s"} sent to ${args.destination.label}`;
  if (!args.refused.length) return `${head}.`;

  const byReason = new Map<string, number>();
  for (const r of args.refused) byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1);
  const lines = [...byReason.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => `${count} × ${reason}`);

  return `${head}. ${args.refused.length} not sent: ${lines.join(" ")}`;
}
