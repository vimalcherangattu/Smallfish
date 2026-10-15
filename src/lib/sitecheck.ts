import "server-only";

import { createHash } from "node:crypto";

import { domainOf } from "@/lib/prospects";
import { rest } from "@/lib/prospecting";
import { judge, readSite } from "@/lib/read";
import { SIGNAL_BY_ID } from "@/lib/signals";
import type { Criterion } from "@/lib/types";

/**
 * The free website checker (GTM). Paste a business's site, pick what to look
 * for, get a yes or no with the proof. The same read and judge a customer's
 * job uses, on one site, for nothing.
 *
 * It is a lead magnet and an embed (agencies put it on their own sites), so
 * the limits are what keep it from being anybody's model budget:
 *
 *   - five checks per visitor per day (a visitor is a daily-salted IP hash,
 *     never the address itself);
 *   - three hundred a day in total, about $5 at the measured read cost;
 *   - a site checked in the last week for the same thing is answered from
 *     that row, free.
 */

export const CHECKABLE = ["booking", "quote_form", "chat"] as const;
export type Checkable = (typeof CHECKABLE)[number];

export const PER_VISITOR = 5;
export const PER_DAY = 300;

export interface CheckResult {
  ok: boolean;
  answer?: "yes" | "no" | "unknown";
  proof?: string;
  reason?: string;
  label?: string;
  pages?: number;
  cached?: boolean;
}

export function visitorOf(req: Request): string {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${day}:${ip}:smallfish-check`).digest("hex").slice(0, 24);
}

const since = (ms: number) => new Date(Date.now() - ms).toISOString();

export async function runCheck(url: string, signal: Checkable, visitor: string, ref: string | null): Promise<CheckResult> {
  const s = SIGNAL_BY_ID[signal];
  const domain = domainOf(url);
  if (!s || !domain) return { ok: false, reason: "That does not look like a website address." };

  // Answered in the last week? Say so again, for free.
  const prior = (await rest(
    `gtm_checks?domain=eq.${encodeURIComponent(domain)}&signal=eq.${signal}&verdict=not.is.null&at=gte.${since(7 * 86_400_000)}&select=verdict&order=at.desc&limit=1`,
  ).catch(() => null)) as Array<{ verdict: string }> | null;
  if (prior?.[0]) {
    const v = JSON.parse(prior[0].verdict) as CheckResult;
    return { ...v, cached: true };
  }

  const mine = ((await rest(`gtm_checks?visitor=eq.${visitor}&at=gte.${since(86_400_000)}&select=id&limit=${PER_VISITOR + 1}`)) as unknown[] | null)?.length ?? 0;
  if (mine >= PER_VISITOR) return { ok: false, reason: `That's ${PER_VISITOR} checks today. Come back tomorrow, or sign up to check whole cities.` };
  const all = ((await rest(`gtm_checks?at=gte.${since(86_400_000)}&select=id&limit=${PER_DAY + 1}`)) as unknown[] | null)?.length ?? 0;
  if (all >= PER_DAY) return { ok: false, reason: "We've hit today's limit for free checks. Try again tomorrow." };

  const criterion: Criterion = {
    id: `${signal}:presence`,
    type: "presence",
    text: s.presenceText,
    explain: s.how,
    needsModel: true,
  };
  const read = await readSite(url, criterion);
  const v = await judge(read, criterion);
  const result: CheckResult = {
    ok: true,
    label: s.label,
    pages: read.pagesFetched.length,
    answer: v.verdict === "match" ? "yes" : v.verdict === "no_match" ? "no" : "unknown",
    proof: v.proof,
    reason: v.reason,
  };
  await rest("gtm_checks", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ visitor, domain, signal, ref, verdict: result.answer === "unknown" ? null : JSON.stringify(result) }),
  }).catch(() => null);
  return result;
}
