/** CSV export with proof columns (S1-06).
 *
 *  The product document is specific about what makes this export different from
 *  every Maps scraper's: it carries "proof columns, and a short 'why it matched'
 *  line usable in outreach". A row you cannot defend is the thing the whole
 *  product exists to avoid exporting, so the evidence travels with the row.
 *
 *  **The export carries matched rows only** — a change of 2026-09-23, and a
 *  reversal of what this file used to do.
 *
 *  It used to export non-matches as full rows, name and phone and website
 *  included, on the reasoning that knowing *why* a business was skipped is worth
 *  more than silently dropping it. That reasoning is still right and is kept,
 *  in `nonMatchSummary` below. What was wrong was the identity travelling with
 *  it: billing only for matches means a criterion nothing satisfies would have
 *  handed over an entire market's names and contacts for free, which is the one
 *  attack the pricing has no answer to. A reason is worth exporting. A name the
 *  user has not unlocked is not ours to give.
 *
 *  So the reasons survive as counts, and the file holds what was paid for.
 */

import { groupForBilling } from "@/lib/billing";
import { overallVerdict, refusalFor, type Entitlement } from "@/lib/entitlement";
import { outreachFor } from "@/lib/outreach";
import {
  BILLABLE,
  VERDICT_LABEL,
  type Business,
  type Criterion,
  type VerdictKind,
} from "@/lib/types";

// `overallVerdict` moved to `entitlement.ts` — it is the first half of "may
// this row leave?", and S2-02's push has to ask the same question. Re-exported
// here so the callers that already import it from this module keep working.
export { overallVerdict };

/** RFC 4180. Quote when the value contains a delimiter, quote or newline. */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** One sentence a user can paste into a cold email without editing it. */
export function whyItMatched(b: Business, criteria: Criterion[]): string {
  const matched = criteria
    .map((c) => ({ c, v: b.verdicts[c.id] }))
    .filter((x) => x.v?.verdict === "match");
  if (!matched.length) return "";

  const clauses = matched.map(({ c, v }) =>
    v?.proof ? `${c.text} (${v.proof})` : c.text,
  );
  return `${b.name} ${clauses.join("; ")}.`;
}

/**
 * What the user learns about the businesses they did not pay for.
 *
 * Counts and reasons, never identities. This is the half of the old
 * export-everything behaviour that was worth keeping: "41 sites block automated
 * reading" is actionable, and the user can go and open those themselves. The
 * names behind the count are not included, because they were not unlocked.
 */
export function nonMatchSummary(
  businesses: Business[],
  criteria: Criterion[],
): { outcome: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const b of businesses) {
    const overall = overallVerdict(b, criteria);
    if (BILLABLE[overall]) continue;
    const label = VERDICT_LABEL[overall];
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([outcome, count]) => ({ outcome, count }))
    .sort((a, b) => b.count - a.count);
}

export function summaryToCsv(rows: { outcome: string; count: number }[]): string {
  const lines = ["outcome,count"];
  for (const r of rows) lines.push([r.outcome, r.count].map(cell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function toCsv(
  businesses: Business[],
  criteria: Criterion[],
  /**
   * Businesses this workspace has exported before, and when (S1-06b).
   *
   * Duplicate protection, and the shape of it matters. The obvious version is
   * to drop rows the customer already has, and it is wrong: they may be
   * re-exporting on purpose, into a different tool, after their CRM ate the
   * first file. Silently returning fewer rows than the screen showed is the
   * behaviour that makes people stop trusting an export.
   *
   * So nothing is dropped. Each row says whether it is new to this workspace
   * and when it was first taken, which is what a mail-merge needs in order not
   * to email the same practice twice — and which lets the customer decide.
   */
  exportedBefore: Record<string, string> = {},
  /** Suppression, and — when it is switched on — paid unlocks. One gate, shared
   *  with the CRM push, so that a row refused in one place is refused in both. */
  ent: Entitlement = {},
): string {
  // One row per business, not per candidate record. Two Overture listings for
  // one practice would otherwise be two rows in the file and two credits on
  // the bill — see `src/lib/billing.ts`.
  const groups = groupForBilling(
    businesses.filter((b) => !refusalFor(b, criteria, ent)),
  );
  const locations = new Map(groups.map((g) => [g.lead.id, g.all.length]));
  const leads = new Set(groups.map((g) => g.lead.id));

  const header = [
    "name",
    "category",
    "address",
    "phone",
    "website",
    "latitude",
    "longitude",
    "overall",
    "billable",
    "locations",
    "first_exported",
    "new_to_you",
    ...criteria.flatMap((c) => [
      `${c.id}__verdict`,
      `${c.id}__evidence`,
      `${c.id}__how_checked`,
    ]),
    "why_it_matched",
    "likely_pain_point",
    "icebreaker",
    "outreach_note",
    // The evidence each note rests on, or — when no note could be written
    // honestly — the reason. It goes in its own column rather than in the note
    // columns, so a "not written: …" line can never be pasted into an email by
    // someone filling a mail-merge from this file.
    "outreach_evidence",
    "pages_read",
    "site_outcome",
    "detected_technology",
    "source",
  ];

  const lines = [header.map(cell).join(",")];

  for (const b of businesses) {
    const overall = overallVerdict(b, criteria);
    // Matched rows only, and nothing that asked to be left out. Everything else
    // is a count, via `nonMatchSummary`.
    if (refusalFor(b, criteria, ent)) continue;
    // And one row per business: a duplicate listing rides on its lead's row.
    if (!leads.has(b.id)) continue;

    lines.push(
      [
        b.name,
        b.cat,
        b.addr,
        b.phone ?? "",
        b.site ?? "",
        b.lat,
        b.lon,
        VERDICT_LABEL[overall],
        BILLABLE[overall] ? "yes" : "no",
        locations.get(b.id) ?? 1,
        exportedBefore[b.id] ?? "",
        exportedBefore[b.id] ? "no" : "yes",
        ...criteria.flatMap((c) => {
          const v = b.verdicts[c.id];
          return [
            VERDICT_LABEL[(v?.verdict ?? "unread") as VerdictKind],
            v?.proof ?? v?.reason ?? "",
            c.explain,
          ];
        }),
        whyItMatched(b, criteria),
        ...((): string[] => {
          const o = outreachFor(b, criteria);
          return [
            o.painPoint ?? "",
            o.icebreaker ?? "",
            o.note ?? "",
            o.withheld ? `not written: ${o.withheld}` : o.basis.join(" | "),
          ];
        })(),
        b.read?.pages ?? 0,
        b.read?.outcome ?? "not read",
        (b.read?.vendors ?? []).join(" | "),
        "Overture Maps + site read by Small Fish",
      ]
        .map(cell)
        .join(","),
    );
  }

  // Excel only reads UTF-8 correctly with a BOM, and these rows carry business
  // names with accents.
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
