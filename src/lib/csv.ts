/** CSV export with proof columns (S1-06).
 *
 *  The product document is specific about what makes this export different from
 *  every Maps scraper's: it carries "proof columns, and a short 'why it matched'
 *  line usable in outreach". A row you cannot defend is the thing the whole
 *  product exists to avoid exporting, so the evidence travels with the row.
 *
 *  Rows that are not matches carry their verdict and reason too. The user paid
 *  for none of them, and knowing *why* a business was skipped is worth more than
 *  silently dropping it — especially "this site blocks automated reading", which
 *  the user can act on by opening it themselves.
 */

import {
  BILLABLE,
  VERDICT_LABEL,
  type Business,
  type Criterion,
  type VerdictKind,
} from "@/lib/types";

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

export function toCsv(businesses: Business[], criteria: Criterion[]): string {
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
    ...criteria.flatMap((c) => [
      `${c.id}__verdict`,
      `${c.id}__evidence`,
      `${c.id}__how_checked`,
    ]),
    "why_it_matched",
    "pages_read",
    "site_outcome",
    "detected_technology",
    "source",
  ];

  const lines = [header.map(cell).join(",")];

  for (const b of businesses) {
    // The headline verdict is the weakest across the criteria the user asked
    // for: a business is only a match when every criterion matched.
    const kinds = criteria.map(
      (c) => (b.verdicts[c.id]?.verdict ?? "unread") as VerdictKind,
    );
    const overall: VerdictKind = kinds.includes("no_match")
      ? "no_match"
      : kinds.every((k) => k === "match")
        ? "match"
        : kinds.includes("blocked")
          ? "blocked"
          : kinds.includes("couldnt_tell")
            ? "couldnt_tell"
            : kinds.includes("needs_model")
              ? "needs_model"
              : "unread";

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
        ...criteria.flatMap((c) => {
          const v = b.verdicts[c.id];
          return [
            VERDICT_LABEL[(v?.verdict ?? "unread") as VerdictKind],
            v?.proof ?? v?.reason ?? "",
            c.explain,
          ];
        }),
        whyItMatched(b, criteria),
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
