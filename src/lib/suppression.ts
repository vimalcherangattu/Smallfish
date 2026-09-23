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
