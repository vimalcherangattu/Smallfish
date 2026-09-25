/**
 * Business opt-out and suppression (S1-09).
 *
 * A business that asks not to be listed is removed within seven days, and the
 * awkward part is said out loud rather than buried: **rows already exported
 * cannot be recalled.** They are in someone's spreadsheet, or their CRM, or an
 * email already sent. Telling an owner "you have been removed" when what we
 * mean is "you will not appear in future searches" would be the same kind of
 * overclaim the rest of this product refuses.
 *
 * Verification is by something only the business controls: an address at the
 * domain we have listed for them, or the phone on the listing. Not a form
 * anybody can fill in — an opt-out that anyone can trigger for anyone else is a
 * way to erase a competitor.
 */

export const REMOVAL_DAYS = 7;

export type Claim =
  | { method: "domain"; value: string }
  | { method: "phone"; value: string };

export type Request = {
  businessId: string;
  claim: Claim;
  at: string;
};

export type Verdict =
  | { accepted: true; removeBy: string; note: string }
  | { accepted: false; reason: string };

const digits = (s: string) => (s || "").replace(/\D/g, "");

export function domainOf(url: string | null | undefined): string | null {
  if (!url) return null;
  const bare = url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];
  return bare.includes(".") ? bare : null;
}

/** Does the claimed contact match what the listing already holds? */
export function verifies(
  claim: Claim,
  listing: { site?: string | null; phone?: string | null },
): boolean {
  if (claim.method === "domain") {
    const claimed = claim.value.includes("@")
      ? claim.value.split("@").pop() ?? ""
      : claim.value;
    const a = domainOf(claimed);
    const b = domainOf(listing.site);
    return !!a && !!b && a === b;
  }
  const a = digits(claim.value).slice(-10);
  const b = digits(listing.phone ?? "").slice(-10);
  return a.length === 10 && a === b;
}

export function requestRemoval(
  request: Request,
  listing: { site?: string | null; phone?: string | null } | null,
): Verdict {
  if (!listing) {
    return { accepted: false, reason: "No business by that id." };
  }
  if (!verifies(request.claim, listing)) {
    return {
      accepted: false,
      reason:
        request.claim.method === "domain"
          ? "That address is not at the domain listed for this business, so we cannot tell it is you. Use an address at the listed domain, or verify by the listed phone number."
          : "That number does not match the one on this listing.",
    };
  }
  const by = new Date(request.at);
  by.setDate(by.getDate() + REMOVAL_DAYS);
  return {
    accepted: true,
    removeBy: by.toISOString(),
    note:
      `Removed from all future searches and exports within ${REMOVAL_DAYS} days. ` +
      "Rows already exported by a customer are in their files and we cannot recall them — " +
      "we can tell you the date each was exported if that helps you follow up.",
  };
}

/** Is this business suppressed? Checked before a row can be shown or exported. */
export const isSuppressed = (list: Set<string>, businessId: string) =>
  list.has(businessId);

/** Remove suppressed businesses from anything about to be shown or billed. */
export function applySuppression<T extends { id: string }>(
  rows: T[],
  suppressed: Set<string>,
): T[] {
  return rows.filter((r) => !suppressed.has(r.id));
}

/** A listing, as much of one as matching a removal request needs. */
export type Listing = { id: string; site?: string | null; phone?: string | null };

/**
 * Every listing a removal request covers.
 *
 * Takes what the owner has — their website or the phone on their listing —
 * rather than a business id, which they have no way of knowing. A domain is
 * matched first and, if it hits, a phone is not tried: a claim that is clearly
 * a domain should not fall through to a digit match on the few characters that
 * happen to be numeric.
 *
 * **It returns every branch.** One domain over several locations is the case
 * the billing rules already had to handle — 23 Phoenix listings share
 * `aspendental.com` — and a removal that reached only the one location whose id
 * someone happened to find would leave the other 22 listed. Matching on the
 * contact rather than the id gets that right by construction.
 */
export function findListings<T extends Listing>(all: T[], claim: string): T[] {
  const raw = claim.trim();
  const asDomain = domainOf(raw.includes("@") ? raw.split("@").pop()! : raw);
  if (asDomain) {
    const hits = all.filter((l) => domainOf(l.site) === asDomain);
    if (hits.length) return hits;
  }
  const asPhone = digits(raw).slice(-10);
  if (asPhone.length === 10) {
    return all.filter((l) => digits(l.phone ?? "").slice(-10) === asPhone);
  }
  return [];
}
