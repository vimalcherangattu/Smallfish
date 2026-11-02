/**
 * Named contacts, bought only as fast as they can be written to (GTM).
 *
 * The owner's call of 2026-10-15: the buyer is a person at a company that
 * sells to small businesses, not `info@`. SuperSearch has them with verified
 * work addresses at one credit each, so this file decides **how many to buy
 * and when**, which is the whole cost question:
 *
 * - Buy only what the sending ramp can use two days from now. Before
 *   `GO_LIVE` that is nothing, so no credit is spent during warm-up.
 * - Stop when the unsent backlog already covers three days.
 * - One trade per search (`tradeSegments`), so every contact arrives with the
 *   trade its company sells to and the email can be specific without a guess.
 *
 * Enrichment is asynchronous: a run buys into a list, a later run reads the
 * list and turns each person into a `gtm_prospects` row, which the push then
 * prepares and queues like any other.
 */

import { countLeads, enrich, listLeads, type ListLead } from "@/lib/instantly";
import { logEvent, rest } from "@/lib/prospecting";
import { domainOf } from "@/lib/prospects";
import type { Places } from "@/lib/region";
import { ownersAt, tradeSegments } from "@/lib/research";
import { dailyPerInbox, newLeadsPerDay, ROLE_ADDRESS } from "@/lib/sequence";

export async function getState<T>(key: string): Promise<T | null> {
  const rows = (await rest(`gtm_state?key=eq.${encodeURIComponent(key)}&select=value&limit=1`)) as
    | Array<{ value: T }>
    | null;
  return rows?.[0]?.value ?? null;
}

export async function setState(key: string, value: unknown): Promise<void> {
  await rest("gtm_state?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key, value, at: new Date().toISOString() }),
  });
}

/** "Austin, Texas, United States" → city and two-letter state, when we can. */
const STATES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA", hawaii: "HI", idaho: "ID",
  illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS", kentucky: "KY", louisiana: "LA",
  maine: "ME", maryland: "MD", massachusetts: "MA", michigan: "MI", minnesota: "MN",
  mississippi: "MS", missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
  "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK", oregon: "OR",
  pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
  tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY", "district of columbia": "DC",
};

export function placeOf(location: unknown, places: Places): { city: string; state: string } | null {
  if (typeof location !== "string") return null;
  const parts = location.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const city = parts[0];
  const st = parts[1].length === 2 ? parts[1].toUpperCase() : STATES[parts[1].toLowerCase()];
  if (!st) return null;
  const known = places.cities.find((c) => c.name.toLowerCase() === city.toLowerCase() && c.state === `US-${st}`);
  return known ? { city: known.name, state: st } : null;
}

/** When a contact's city is unknown or too small to list, their list is for
 *  one of the ten largest cities, the same one every time for the same company. */
export function fallbackCity(domain: string, places: Places): { city: string; state: string } {
  const top = [...places.cities].sort((a, b) => b.pop - a.pop).slice(0, 10);
  let h = 0;
  for (const ch of domain) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = top[h % top.length];
  return { city: c.name, state: c.state.replace(/^US-/, "") };
}

type Lists = Record<string, string>;

/** Turn people in our enrichment lists into prospects. Free: the credit was
 *  spent when they were bought. */
export async function importContacts(places: Places): Promise<number> {
  const lists = (await getState<Lists>("supersearch_lists")) ?? {};
  const segs = new Map(tradeSegments().map((s) => [s.id, s]));
  let added = 0;
  for (const [segId, listId] of Object.entries(lists)) {
    const seg = segs.get(segId);
    if (!seg) continue;
    const people: ListLead[] = await listLeads(listId, 100).catch(() => []);
    const rows = [];
    for (const l of people) {
      const email = l.email?.trim().toLowerCase();
      if (!email || ROLE_ADDRESS.test(email)) continue;
      const domain = (l.company_domain && domainOf(l.company_domain)) || email.split("@")[1];
      if (!domain) continue;
      const where =
        placeOf(l.payload?.location ?? l.payload?.city ?? l.payload?.companyLocation, places) ??
        fallbackCity(domain, places);
      rows.push({
        domain,
        name: l.company_name ?? null,
        site: l.website || `https://${domain}`,
        city: where.city,
        state: where.state,
        email,
        first_name: l.first_name ?? null,
        contact_name: [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
        contact_title: l.job_title ?? null,
        niche: seg.niche,
        status: "found",
        audience: "seller",
        segment: segId,
        source: "supersearch",
        outcome: "supersearch",
        read_at: new Date().toISOString(),
      });
    }
    if (rows.length) {
      // A company already in the table (an agency the finder read, or this
      // person last time) is left as it is.
      await rest("gtm_prospects?on_conflict=domain", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify(rows),
      });
      added += rows.length;
    }
  }
  if (added) await logEvent("contacts_imported", {}, { rows: added });
  added += await importOwners(lists);
  return added;
}

/* --------------------------------------- owners at agencies we read -- */

const OWNERS = "owners-at-read-agencies";

/** Agencies the finder read and wrote a trade for, whose own site gave us no
 *  person: no address, or only info@ and the like. 61 of the 69 agencies
 *  with a trade on 2026-11-01 were exactly this. */
async function agenciesWithoutAPerson(): Promise<Array<{ domain: string; email: string | null }>> {
  const rows = ((await rest(
    "gtm_prospects?audience=eq.agency&niche=not.is.null&status=in.(found,no_email)&select=domain,email&limit=2000",
  )) ?? []) as Array<{ domain: string; email: string | null }>;
  return rows.filter((r) => !r.email || ROLE_ADDRESS.test(r.email));
}

/**
 * Put a named founder on those agencies' own rows. Not a new prospect: the
 * agency, its trade and its free list are already ours, so the person
 * replaces info@ on the row and the agency campaign can write to them.
 */
async function importOwners(lists: Lists): Promise<number> {
  const listId = lists[OWNERS];
  if (!listId) return 0;
  const people = await listLeads(listId, 1000).catch(() => [] as ListLead[]);
  const open = new Map((await agenciesWithoutAPerson()).map((r) => [r.domain, r]));
  let named = 0;
  for (const l of people) {
    const email = l.email?.trim().toLowerCase();
    const domain = (l.company_domain && domainOf(l.company_domain)) || email?.split("@")[1];
    // The push route is a 60-second Vercel function: a hundred rows a run,
    // the rest on the next hourly run.
    if (named >= 100) break;
    if (!email || !domain || ROLE_ADDRESS.test(email) || !open.has(domain)) continue;
    await rest(`gtm_prospects?domain=eq.${encodeURIComponent(domain)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        email,
        first_name: l.first_name ?? null,
        contact_name: [l.first_name, l.last_name].filter(Boolean).join(" ") || null,
        contact_title: l.job_title ?? null,
        status: "found",
        updated_at: new Date().toISOString(),
      }),
    });
    open.delete(domain);
    named += 1;
  }
  if (named) await logEvent("owners_named", {}, { rows: named });
  return named;
}

/**
 * Buy the founders at agencies without a person, each agency once. Inside the
 * owner's monthly cap like every other buy; these come first because the
 * agency is already read, already has a trade and a free list, and only
 * lacked someone to write to.
 */
async function buyOwners(room: number, month: string, used: number): Promise<number> {
  if (room <= 0) return 0;
  const tried = new Set((await getState<string[]>("owners_tried")) ?? []);
  const domains = (await agenciesWithoutAPerson()).map((r) => r.domain).filter((d) => !tried.has(d)).slice(0, 500);
  if (!domains.length) return 0;
  const seg = ownersAt(domains);
  const filters = { ...seg.filters, skip_owned_leads: true };
  const available = await countLeads(filters).catch(() => 0);
  for (const d of domains) tried.add(d);
  await setState("owners_tried", [...tried]);
  if (available === 0) return 0;
  const limit = Math.min(available, room, 400);
  await setState("supersearch_spent", { month, contacts: used + limit });
  const lists = (await getState<Lists>("supersearch_lists")) ?? {};
  const r = await enrich({ filters, limit, listId: lists[OWNERS] ?? null, listName: `Small Fish · ${OWNERS}` });
  lists[OWNERS] = r.resource_id;
  await setState("supersearch_lists", lists);
  await logEvent("contacts_bought", {}, { segment: OWNERS, limit, available, agencies: domains.length });
  return limit;
}

/**
 * Buy the next batch, if the ramp needs one. Returns what it did, for the
 * push route's answer and the log.
 */
export async function buyContacts(inboxCount: number, now = new Date()): Promise<Record<string, unknown>> {
  const ahead = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const perDay = newLeadsPerDay(dailyPerInbox(ahead), inboxCount);
  if (perDay === 0) return { bought: 0, why: "warm-up: nothing to send yet" };

  // **Spending needs the owner's say-so.** Nothing is bought unless the owner
  // has set a monthly cap in `gtm_state.supersearch_budget` ({"monthly": N},
  // N contacts). Absent or zero means buy nothing, and the cap is never
  // exceeded: credits are money, and code does not decide to spend it.
  const budget = await getState<{ monthly: number }>("supersearch_budget");
  const month = now.toISOString().slice(0, 7);
  const spent = await getState<{ month: string; contacts: number }>("supersearch_spent");
  const used = spent?.month === month ? spent.contacts : 0;
  const room = Math.max(0, (budget?.monthly ?? 0) - used);
  if (room === 0) {
    return { bought: 0, why: budget?.monthly ? `monthly cap of ${budget.monthly} reached` : "no budget approved yet" };
  }

  // Founders at agencies we already read go first (see `buyOwners`). Each
  // agency is tried once, so this does not need the once-a-day guard, and it
  // does not wait on the sellers' backlog.
  const owners = await buyOwners(room, month, used);
  if (owners >= room) return { bought: owners, owners, why: "monthly cap reached on agency owners" };

  const backlog = ((await rest(
    "gtm_prospects?audience=eq.seller&status=eq.found&select=domain&limit=1000",
  )) as unknown[] | null)?.length ?? 0;
  if (backlog >= perDay * 3) return { bought: owners, owners, why: `backlog of ${backlog} covers three days` };

  // Once a day is enough: enrichment is asynchronous and a second buy before
  // the first lands would double-spend.
  const last = await getState<{ day: string }>("supersearch_last_buy");
  const today = now.toISOString().slice(0, 10);
  if (last?.day === today) return { bought: owners, owners, why: "already bought today" };

  const segs = tradeSegments();
  const lists = (await getState<Lists>("supersearch_lists")) ?? {};
  let i = (await getState<number>("supersearch_rotation")) ?? 0;
  // Fill the day's need across segments. The narrow ones come first in the
  // rotation ("hiring reps now"), and on 2026-11-01 they held 9 and 6 people:
  // stopping at the first segment bought 15 contacts in two days against a
  // ramp that wanted ~45. Each segment is its own list and its own filters,
  // so two buys in one run never double-spend the same people.
  let want = Math.min(perDay * 3 - backlog, room - owners, 100);
  let usedNow = used + owners;
  const bought: Array<{ segment: string; limit: number }> = [];
  for (let tries = 0; tries < segs.length && want > 0; tries += 1, i += 1) {
    const seg = segs[i % segs.length];
    const available = await countLeads(seg.filters).catch(() => 0);
    if (available === 0) continue;
    const limit = Math.min(want, available);
    usedNow += limit;
    await setState("supersearch_spent", { month, contacts: usedNow });
    const r = await enrich({
      filters: seg.filters,
      limit,
      listId: lists[seg.id] ?? null,
      listName: `Small Fish · ${seg.id}`,
    });
    lists[seg.id] = r.resource_id;
    await logEvent("contacts_bought", {}, { segment: seg.id, limit, available });
    bought.push({ segment: seg.id, limit });
    want -= limit;
  }
  if (!bought.length) return { bought: owners, owners, why: "no segment has anyone left" };
  await setState("supersearch_lists", lists);
  await setState("supersearch_rotation", i);
  await setState("supersearch_last_buy", { day: today, segments: bought.map((b) => b.segment), limit: usedNow - used - owners });
  return { bought: usedNow - used, owners, segments: bought };
}
