import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { activate, addLeads, countLeads, ensureCampaign, ensureWebhook, inboxes, instantlyReady } from "@/lib/instantly";
import { buyContacts, importContacts } from "@/lib/contactpipe";
import { ownersAt, SEGMENTS } from "@/lib/research";
import { hookSecret, schedulerAuthorised } from "@/lib/outreachauth";
import { listCriterion, logEvent, prepareList, rest, suppressedOutreach } from "@/lib/prospecting";
import { NICHES } from "@/lib/prospects";
import type { Places } from "@/lib/region";
import { blocked, campaignFor, companyName, dailyPerInbox, GO_LIVE, leadVariables, type Audience, type Prospect } from "@/lib/sequence";
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

type Row = Prospect & { site: string; audience: Audience; first_name: string | null };

export async function GET(req: Request) {
  if (!(await schedulerAuthorised(req))) return Response.json({ ok: false }, { status: 401 });
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
  // Once a day (the 14:07 UTC run): counts do not move hourly.
  const countToday = new Date().getUTCHours() === 14 || new URL(req.url).searchParams.has("research");
  for (const seg of countToday ? [...SEGMENTS, ...(agencyDomains.length ? [ownersAt(agencyDomains)] : [])] : []) {
    try {
      research[seg.id] = await countLeads(seg.filters);
      await logEvent("research_count", {}, { segment: seg.id, what: seg.what, count: research[seg.id] });
    } catch (err) {
      research[seg.id] = String(err).slice(0, 200);
      await logEvent("research_failed", {}, { segment: seg.id, error: String(err).slice(0, 400) });
    }
  }
  out.research = research;

  // 2 · campaigns, webhook, contacts, queue
  const boxes = await inboxes();
  const today = new Date().toISOString().slice(0, 10);
  const perInbox = dailyPerInbox(today);
  // The ramp is shared: sellers carry most of it, agencies the rest.
  const total = Math.max(1, perInbox * boxes.length);
  const share: Record<Audience, number> = {
    seller: Math.max(1, Math.ceil(total * 0.75)),
    agency: Math.max(1, Math.floor(total * 0.25)),
  };
  const emails = boxes.map((b) => b.email);
  const campaigns = {
    agency: await ensureCampaign(emails, share.agency, campaignFor("agency")),
    seller: await ensureCampaign(emails, share.seller, campaignFor("seller")),
  };
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

  // Named people: read what was bought, then buy only what the ramp needs and
  // the owner's monthly cap allows (none until one is set).
  try {
    out.contactsImported = await importContacts(places);
    out.contacts = await buyContacts(boxes.length);
  } catch (err) {
    out.contacts = `failed: ${String(err).slice(0, 200)}`;
    await logEvent("contacts_failed", {}, { error: String(err).slice(0, 400) });
  }

  const sup = await suppressedOutreach();
  const rows = ((await rest(
    "gtm_prospects?status=eq.found&list_token=not.is.null&select=domain,name,email,first_name,niche,city,state,status,list_token,list_query,list_readable,list_listings,site,audience&limit=200",
  )) as Row[]) ?? [];
  type Queued = { p: Row; lead: Parameters<typeof addLeads>[1][number] };
  const byAudience: Record<Audience, Queued[]> = { agency: [], seller: [] };
  const skipped: Record<string, number> = {};
  for (const p of rows) {
    const why = blocked(p, { suppressedDomains: sup.domains, suppressedEmails: sup.emails });
    if (why) {
      skipped[why] = (skipped[why] ?? 0) + 1;
      continue;
    }
    const n = NICHES.find((x) => x.id === p.niche)!;
    byAudience[p.audience === "seller" ? "seller" : "agency"].push({
      p,
      lead: {
        email: p.email!,
        ...(p.first_name ? { first_name: p.first_name } : {}),
        company_name: companyName(p.name, p.domain),
        website: p.site,
        custom_variables: leadVariables(p, SITE, { niche: n.label, gap: listCriterion(p.niche)!.label }),
      },
    });
  }
  let queued = 0;
  for (const a of ["agency", "seller"] as Audience[]) {
    const leads = byAudience[a];
    if (!leads.length) continue;
    await addLeads(campaigns[a].id, leads.map((l) => l.lead));
    const domains = leads.map((l) => l.p.domain);
    await rest(`gtm_prospects?domain=in.(${domains.map((d) => `"${d}"`).join(",")})`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ status: "queued", updated_at: new Date().toISOString() }),
    });
    for (const l of leads) {
      await logEvent("queued", { domain: l.p.domain, email: l.p.email }, { campaign: campaigns[a].id, audience: a });
    }
    queued += leads.length;
  }
  out.queued = queued;
  out.skipped = skipped;

  // 3 · go live
  const allReady = boxes.length > 0 && boxes.every((b) => b.ready);
  out.inboxes = { total: boxes.length, ready: boxes.filter((b) => b.ready).length };
  out.perInboxToday = perInbox;
  out.goLive = GO_LIVE;
  const activated: string[] = [];
  for (const a of ["agency", "seller"] as Audience[]) {
    const c = campaigns[a];
    if (perInbox > 0 && allReady && c.status !== 1) {
      await activate(c.id);
      await logEvent("campaign_activated", {}, { campaign: c.id, audience: a, perInbox });
      activated.push(a);
    } else if (c.status === 1) activated.push(a);
  }
  out.activated = activated;
  if (!activated.length) out.waiting = perInbox === 0 ? `warm-up until ${GO_LIVE}` : "inboxes still being set up";
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}
