import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { activate, addLeads, countLeads, ensureCampaign, ensureWebhook, inboxes, instantlyReady } from "@/lib/instantly";
import { ownersAt, SEGMENTS } from "@/lib/research";
import { cronAuthorised, hookSecret } from "@/lib/outreachauth";
import { listCriterion, logEvent, prepareList, rest, suppressedOutreach } from "@/lib/prospecting";
import { NICHES } from "@/lib/prospects";
import type { Places } from "@/lib/region";
import { blocked, companyName, dailyPerInbox, GO_LIVE, leadVariables, type Prospect } from "@/lib/sequence";
import type { Taxonomy } from "@/lib/trades";

/**
 * The daily outreach step (GTM, outreach A3). Vercel Cron, behind CRON_SECRET.
 *
 * 1. **Prepare.** Give found prospects a list link and a count, a few per run
 *    because each count is a ten-second query.
 * 2. **Queue.** Every prospect that clears `blocked()` goes to the Instantly
 *    campaign with its variables, and is marked `queued`.
 * 3. **Go live, once.** The campaign is created paused. It is activated only
 *    when today is past `GO_LIVE` and Instantly says every inbox is ready,
 *    and its daily limit follows the warm-up ramp in `sequence.ts`.
 *
 * Nothing here needs a person. What it did is in the response and in
 * `gtm_events`, which is what `/ops/outreach` reads.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.getsmallfish.com").replace(/\/$/, "");
const dir = path.join(process.cwd(), "public", "data");
const json = async <T,>(n: string) => JSON.parse(await readFile(path.join(dir, n), "utf8")) as T;

type Row = Prospect & { site: string };

export async function GET(req: Request) {
  if (!cronAuthorised(req)) return Response.json({ ok: false }, { status: 401 });
  const started = Date.now();
  const out: Record<string, unknown> = { ok: true };

  // 1 · prepare
  const [taxo, places] = await Promise.all([json<Taxonomy>("trades.json"), json<Places>("places-us.json")]);
  const unprepared = ((await rest(
    "gtm_prospects?status=eq.found&list_token=is.null&select=domain,niche,city,state&limit=4",
  )) as Array<{ domain: string; niche: string | null; city: string | null; state: string | null }>) ?? [];
  let prepared = 0;
  for (const p of unprepared) {
    if (Date.now() - started > 25_000) break;
    const r = await prepareList(p, { taxo, places }, (n) => randomBytes(n)).catch(() => null);
    if (r) {
      prepared += 1;
      await logEvent("prepared", { domain: p.domain }, { query: r.query, readable: r.readable });
    }
  }
  out.prepared = prepared;

  if (!instantlyReady()) return Response.json({ ...out, sending: "INSTANTLY_API_KEY is not set" });

  // 1b · size the audiences. Free: a count spends no credits. Logged so the
  // choice of who to write to is read off numbers.
  const agencyDomains = (((await rest(
    "gtm_prospects?niche=not.is.null&select=domain&limit=500",
  )) as Array<{ domain: string }>) ?? []).map((r) => r.domain);
  const research: Record<string, number | string> = {};
  for (const seg of [...SEGMENTS, ...(agencyDomains.length ? [ownersAt(agencyDomains)] : [])]) {
    try {
      research[seg.id] = await countLeads(seg.filters);
      await logEvent("research_count", {}, { segment: seg.id, what: seg.what, count: research[seg.id] });
    } catch (err) {
      research[seg.id] = String(err).slice(0, 200);
      await logEvent("research_failed", {}, { segment: seg.id, error: String(err).slice(0, 400) });
    }
  }
  out.research = research;

  // 2 · campaign, webhook, queue
  const boxes = await inboxes();
  const today = new Date().toISOString().slice(0, 10);
  const perInbox = dailyPerInbox(today);
  const campaign = await ensureCampaign(boxes.map((b) => b.email), Math.max(1, perInbox * boxes.length));
  const secret = hookSecret();
  // Third-party sources say webhooks need a higher Instantly plan. If so, the
  // send still runs; replies then wait in Instantly's inbox, and this says why.
  try {
    if (secret) await ensureWebhook(`${SITE}/api/outreach/hook`, secret);
    out.webhook = "registered";
  } catch (err) {
    out.webhook = `not registered: ${String(err).slice(0, 160)}`;
    await logEvent("webhook_failed", {}, { error: String(err).slice(0, 300) });
  }

  const sup = await suppressedOutreach();
  const rows = ((await rest(
    "gtm_prospects?status=eq.found&list_token=not.is.null&select=domain,name,email,niche,city,state,status,list_token,list_query,list_readable,list_listings,site&limit=200",
  )) as Row[]) ?? [];
  const leads = [];
  const skipped: Record<string, number> = {};
  for (const p of rows) {
    const why = blocked(p, { suppressedDomains: sup.domains, suppressedEmails: sup.emails });
    if (why) {
      skipped[why] = (skipped[why] ?? 0) + 1;
      continue;
    }
    const n = NICHES.find((x) => x.id === p.niche)!;
    leads.push({
      p,
      lead: {
        email: p.email!,
        company_name: companyName(p.name, p.domain),
        website: p.site,
        custom_variables: leadVariables(p, SITE, { niche: n.label, gap: listCriterion(p.niche)!.label }),
      },
    });
  }
  if (leads.length) {
    await addLeads(campaign.id, leads.map((l) => l.lead));
    const domains = leads.map((l) => l.p.domain);
    await rest(`gtm_prospects?domain=in.(${domains.map((d) => `"${d}"`).join(",")})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "queued", updated_at: new Date().toISOString() }),
    });
    for (const l of leads) await logEvent("queued", { domain: l.p.domain, email: l.p.email }, { campaign: campaign.id });
  }
  out.queued = leads.length;
  out.skipped = skipped;

  // 3 · go live
  const allReady = boxes.length > 0 && boxes.every((b) => b.ready);
  out.inboxes = { total: boxes.length, ready: boxes.filter((b) => b.ready).length };
  out.perInboxToday = perInbox;
  out.goLive = GO_LIVE;
  if (perInbox > 0 && allReady && campaign.status !== 1) {
    await activate(campaign.id);
    await logEvent("campaign_activated", {}, { campaign: campaign.id, perInbox });
    out.activated = true;
  } else {
    out.activated = campaign.status === 1;
    if (!out.activated) out.waiting = perInbox === 0 ? `warm-up until ${GO_LIVE}` : "inboxes still being set up";
  }
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
