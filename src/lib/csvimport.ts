/**
 * A list the customer already has, checked against what they sell (P1).
 *
 * ## Why this is the cheapest route to "any market"
 *
 * Reading a market we have never read needs candidates, and candidates come
 * from Overture via DuckDB, which is Python and cannot run on Vercel (P0.2).
 * **Upload sidesteps all of it**: the customer brings the businesses. An agency
 * with a bought list, a founder with a conference export, anyone with a CRM
 * they suspect is half-dead — they get the same reading, the same evidence and
 * the same drafted opener, today, in whatever city they like.
 *
 * ## The criterion comes from the catalogue, never from free text
 *
 * An uploaded list still has to be checked against *something*, and the
 * something is a signal from `signals.ts` — not a sentence the customer types.
 * Two reasons, and the second is the one that matters:
 *
 *   1. A free-text question is a stranger's string that reaches a model prompt
 *      and a database, and bounding it properly is work this does not need.
 *   2. **The catalogue is how the product refuses.** `provable: false` entries
 *      exist so the ICP flow can say "we cannot settle that" out loud rather
 *      than proposing a criterion the engine has no detector for. A free-text
 *      box would route straight around that, and the first customer to type
 *      "businesses that are struggling" would get a confident answer to a
 *      question nothing can answer.
 *
 * So the picker offers the provable signals, in both directions, and says
 * plainly what the unprovable ones would take. `docs/icp-discovery.md` rule 1.
 *
 * ## What the parser is for
 *
 * Getting a website out of a file somebody exported from something else. It is
 * deliberately forgiving about shape — a BOM, CRLF, quoted commas, a title row
 * above the headers, columns called any of nine things — and completely
 * unforgiving about the one field that matters: **a row with no usable website
 * is reported, not silently dropped.** A file that quietly loses a third of its
 * rows is the failure that makes somebody stop trusting an import.
 */

import { SIGNALS, SIGNAL_BY_ID, type ObservableSignal } from "@/lib/signals";
import type { Criterion } from "@/lib/types";

/** A business the customer brought. */
export interface UploadedRow {
  name: string | null;
  site: string;
  phone: string | null;
}

export interface ParsedUpload {
  rows: UploadedRow[];
  /** Header names as they appeared, for showing what we matched. */
  headers: string[];
  /** Which column each field came from, so the screen can say so. */
  matched: { site: string | null; name: string | null; phone: string | null };
  /** Rows with no usable website. Counted and explained, never dropped quietly. */
  skipped: { line: number; why: string }[];
  /** Rows that were the same website as an earlier row. */
  duplicates: number;
}

/**
 * Split CSV text into cells.
 *
 * Written out rather than taken from a library because the rules are small and
 * the failure modes are specific: a quoted field containing a comma, a quoted
 * field containing a newline, and `""` as an escaped quote. All three appear in
 * real exports — a business called `Smith, Jones & Co` is the common one — and
 * a split on `,` turns that row into two wrong columns silently.
 */
export function parseCsv(text: string): string[][] {
  // A BOM survives a round trip through Excel and makes the first header
  // `﻿name`, which then matches nothing.
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim()));
}

const HEADERS = {
  site: /^(website|web ?site|url|domain|site|homepage|web|company ?url|website ?url)$/i,
  name: /^(name|business|business ?name|company|company ?name|organi[sz]ation|account)$/i,
  phone: /^(phone|telephone|tel|phone ?number|mobile|contact ?number)$/i,
};

/** Does this look like a URL or a bare domain? */
const looksLikeSite = (v: string) =>
  /^(https?:\/\/)?[a-z0-9][a-z0-9-]*(\.[a-z0-9-]+)+(\/|$|\?|#)/i.test(v.trim());

/**
 * Normalise whatever they pasted into something fetchable.
 *
 * `acme.com`, `www.acme.com`, `http://acme.com/contact` and
 * `https://acme.com?utm_source=x` all become `https://acme.com`. The path and
 * query go: the reader starts at the site root and follows the links that
 * matter for the criterion, so a deep link from somebody's CRM would start it
 * in the wrong place and a tracking parameter is not part of the address.
 */
export function normaliseSite(raw: string): string | null {
  const v = raw.trim();
  if (!v || !looksLikeSite(v)) return null;
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!u.hostname.includes(".")) return null;
    return `https://${u.hostname.replace(/^www\./i, "")}`;
  } catch {
    return null;
  }
}

/**
 * Find the header row.
 *
 * Exports often carry a title line, a blank line, or a "generated on" stamp
 * above the real headers. So the first five rows are examined and the first one
 * carrying a recognisable website column wins. If none does, the first row is
 * assumed to be headers anyway and the column is found by content instead —
 * see `columnByContent`.
 */
function headerRowIndex(rows: string[][]): number {
  for (let i = 0; i < Math.min(5, rows.length); i += 1) {
    if (rows[i].some((h) => HEADERS.site.test(h.trim()))) return i;
  }
  return 0;
}

/**
 * The website column, found by looking at the values.
 *
 * The fallback when the header is called something we do not recognise —
 * "Link", "Their page", a language other than English. The column where the
 * most values look like a website is the website column, and requiring a
 * clear majority means a stray URL in a notes field cannot win.
 */
function columnByContent(body: string[][], width: number): number | null {
  let best = -1;
  let bestHits = 0;
  for (let c = 0; c < width; c += 1) {
    const hits = body.filter((r) => looksLikeSite(r[c] ?? "")).length;
    if (hits > bestHits) {
      bestHits = hits;
      best = c;
    }
  }
  return bestHits >= Math.max(1, body.length * 0.5) ? best : null;
}

export function parseUpload(text: string, limit = 5000): ParsedUpload {
  const all = parseCsv(text);
  if (!all.length) {
    return {
      rows: [],
      headers: [],
      matched: { site: null, name: null, phone: null },
      skipped: [],
      duplicates: 0,
    };
  }

  const h = headerRowIndex(all);
  const headers = all[h].map((s) => s.trim());
  const body = all.slice(h + 1);
  const width = Math.max(headers.length, ...body.map((r) => r.length));

  const byHeader = (re: RegExp) => {
    const i = headers.findIndex((name) => re.test(name));
    return i >= 0 ? i : null;
  };

  let siteCol = byHeader(HEADERS.site);
  if (siteCol === null) siteCol = columnByContent(body, width);
  const nameCol = byHeader(HEADERS.name);
  const phoneCol = byHeader(HEADERS.phone);

  const rows: UploadedRow[] = [];
  const skipped: ParsedUpload["skipped"] = [];
  const seen = new Set<string>();
  let duplicates = 0;

  body.forEach((r, i) => {
    const line = h + i + 2; // 1-based, and past the header
    if (rows.length >= limit) return;

    const raw = siteCol === null ? "" : (r[siteCol] ?? "");
    const site = normaliseSite(raw);
    if (!site) {
      skipped.push({
        line,
        why: raw.trim()
          ? `"${raw.trim().slice(0, 40)}" is not a website we can open`
          : "no website in this row",
      });
      return;
    }
    if (seen.has(site)) {
      duplicates += 1;
      return;
    }
    seen.add(site);

    const cell = (c: number | null) => {
      const v = c === null ? "" : (r[c] ?? "").trim();
      return v || null;
    };
    rows.push({ name: cell(nameCol), site, phone: cell(phoneCol) });
  });

  return {
    rows,
    headers,
    matched: {
      site: siteCol === null ? null : (headers[siteCol] ?? `column ${siteCol + 1}`),
      name: nameCol === null ? null : headers[nameCol],
      phone: phoneCol === null ? null : headers[phoneCol],
    },
    skipped,
    duplicates,
  };
}

// ------------------------------------------------------- what to check for --

/**
 * The questions an uploaded list can be checked against.
 *
 * Both directions of every **provable** signal. The unprovable ones are
 * returned too, marked, so the screen can name them and say what settling them
 * would take — the ICP flow's rule, applied here for the same reason: a picker
 * that silently omits them looks better and teaches the customer nothing about
 * what this engine can and cannot see.
 */
export interface CheckOption {
  /** `booking:absence`. Stored on the job as its criterion id. */
  id: string;
  signalId: string;
  type: "presence" | "absence";
  text: string;
  how: string;
  provable: boolean;
  wouldTake?: string;
}

const option = (s: ObservableSignal, type: "presence" | "absence"): CheckOption => ({
  id: `${s.id}:${type}`,
  signalId: s.id,
  type,
  text: type === "absence" ? s.absenceText : s.presenceText,
  how: s.how,
  provable: s.provable,
  wouldTake: s.wouldTake,
});

export const CHECK_OPTIONS: CheckOption[] = SIGNALS.flatMap((s) => [
  option(s, "absence"),
  option(s, "presence"),
]);

/** Only the ones an upload may actually be run against. */
export const runnableChecks = () => CHECK_OPTIONS.filter((o) => o.provable);

/**
 * Turn a stored check id back into a criterion the engine can run.
 *
 * The worker calls this: a job from an upload has no market file to look a
 * criterion up in, so the id carries everything needed to rebuild it. Returns
 * null for an id that is not in the catalogue or not provable, which is the
 * refusal rather than a best guess.
 */
export function criterionForCheck(id: string): Criterion | null {
  // Exactly two parts. The first version destructured `split(":")` and ignored
  // anything after the second, so `booking:absence:extra` was accepted and
  // stored verbatim as the job's `criterion_id` — two ids meaning one criterion,
  // one of which the catalogue would never produce, in a column later rows are
  // grouped and reported by.
  const parts = String(id).split(":");
  if (parts.length !== 2) return null;
  const [signalId, type] = parts;
  if (type !== "presence" && type !== "absence") return null;
  const signal = SIGNAL_BY_ID[signalId];
  if (!signal || !signal.provable) return null;
  return {
    id,
    type,
    text: type === "absence" ? signal.absenceText : signal.presenceText,
    explain: signal.how,
    // Absence always needs a model: a missing script is not proof of a missing
    // feature, which is this codebase's absence rule.
    needsModel: type === "absence" || !signal.detected,
  };
}
