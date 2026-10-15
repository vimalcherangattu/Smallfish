/**
 * The one place that talks to Instantly (GTM, outreach A3 and A4).
 *
 * API v2, Bearer key from `INSTANTLY_API_KEY`. Shapes are from Instantly's
 * published OpenAPI document (`api.instantly.ai/openapi/api_v2.json`, read
 * 2026-10-15), not from memory: the reply endpoint wants `reply_to_uuid` and
 * an `eaccount`, a lead is added with `custom_variables`, and a campaign's
 * copy lives in `sequences[0].steps[].variants[]`.
 *
 * Nothing here decides whether to send. `sequence.ts` gates, the routes
 * decide, this only carries.
 */

import { type Step } from "@/lib/sequence";

const API = "https://api.instantly.ai/api/v2";

export class InstantlyError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const instantlyReady = () => !!process.env.INSTANTLY_API_KEY;

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const key = process.env.INSTANTLY_API_KEY;
  if (!key) throw new InstantlyError(0, "INSTANTLY_API_KEY is not set");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new InstantlyError(res.status, `${init?.method ?? "GET"} ${path}: ${res.status} ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

/* ---------------------------------------------------------- accounts -- */

export interface Inbox {
  email: string;
  ready: boolean;
}

/** The sending inboxes, and whether each is out of setup. Instantly does not
 *  document its status enums, so "ready" is the one thing it does say plainly:
 *  `setup_pending` is false. Warm-up age is held by `GO_LIVE` instead. */
export async function inboxes(): Promise<Inbox[]> {
  const r = await api<{ items?: Array<Record<string, unknown>> }>("/accounts?limit=100");
  return (r.items ?? []).map((a) => ({ email: String(a.email), ready: a.setup_pending === false }));
}

/* --------------------------------------------------------- campaign -- */

interface Campaign {
  id: string;
  name: string;
  status: number;
}

const schedule = {
  schedules: [
    {
      name: "US business hours",
      timing: { from: "09:00", to: "16:00" },
      days: { 0: false, 1: true, 2: true, 3: true, 4: true, 5: false, 6: false },
      timezone: "America/Chicago",
    },
  ],
};

/**
 * The campaign, found by name or created **paused**. Creating it never starts
 * it; `activate` is a separate call the push route makes only past `GO_LIVE`
 * with every inbox ready.
 */
export async function ensureCampaign(
  emails: string[],
  dailyLimit: number,
  spec: { name: string; steps: Step[] },
): Promise<Campaign> {
  const { name: CAMPAIGN_NAME, steps: STEPS } = spec;
  const found = await api<{ items?: Campaign[] }>(`/campaigns?search=${encodeURIComponent(CAMPAIGN_NAME)}&limit=10`);
  const hit = found.items?.find((c) => c.name === CAMPAIGN_NAME);
  if (hit) {
    await api(`/campaigns/${hit.id}`, {
      method: "PATCH",
      body: JSON.stringify({ email_list: emails, daily_limit: dailyLimit }),
    });
    return hit;
  }
  return api<Campaign>("/campaigns", {
    method: "POST",
    body: JSON.stringify({
      name: CAMPAIGN_NAME,
      campaign_schedule: schedule,
      sequences: [
        {
          steps: STEPS.map((s) => ({
            type: "email",
            delay: s.delay,
            delay_unit: "days",
            variants: [{ subject: s.subject, body: s.body }],
          })),
        },
      ],
      email_list: emails,
      daily_limit: dailyLimit,
      stop_on_reply: true,
      stop_on_auto_reply: false,
      stop_for_company: true,
      link_tracking: false,
      open_tracking: false,
      insert_unsubscribe_header: true,
      prioritize_new_leads: false,
      email_gap: 10,
      random_wait_max: 10,
    }),
  });
}

export const activate = (id: string) => api(`/campaigns/${id}/activate`, { method: "POST" });
export const pause = (id: string) => api(`/campaigns/${id}/pause`, { method: "POST" });

/* ------------------------------------------------------------- leads -- */

export interface Lead {
  email: string;
  first_name?: string;
  last_name?: string;
  company_name: string;
  website: string;
  custom_variables: Record<string, string>;
}

/** Add leads to the campaign. Skips anyone already anywhere in the workspace,
 *  so a prospect is never written to twice by two campaigns. */
export async function addLeads(campaignId: string, leads: Lead[]): Promise<unknown> {
  if (!leads.length) return null;
  return api("/leads/add", {
    method: "POST",
    // Not `skip_if_in_workspace`: a SuperSearch contact already sits in its
    // enrichment list. Skipping anyone in any *campaign* is the guarantee that
    // matters, that nobody is written to twice.
    body: JSON.stringify({ campaign_id: campaignId, leads, skip_if_in_campaign: true }),
  });
}

/** Put an address on the workspace block list, so no campaign can reach it. */
export const block = (value: string) =>
  api("/block-lists-entries", { method: "POST", body: JSON.stringify({ bl_value: value }) });

/* ----------------------------------------------------------- webhook -- */

/** Register our webhook once, with a header only we know. */
export async function ensureWebhook(url: string, secret: string): Promise<void> {
  const list = await api<{ items?: Array<{ target_hook_url: string }> }>("/webhooks?limit=100");
  if (list.items?.some((w) => w.target_hook_url === url)) return;
  await api("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      name: "Small Fish outreach log",
      target_hook_url: url,
      event_type: "all_events",
      headers: { "x-smallfish-hook": secret },
    }),
  });
}

/* ------------------------------------------------------------ emails -- */

export interface Email {
  id: string;
  subject: string;
  lead: string | null;
  eaccount: string;
  from_address_email: string | null;
  thread_id: string | null;
  is_auto_reply: number | null;
  timestamp_email: string;
  body?: { text?: string; html?: string };
  content_preview?: string | null;
}

/** The thread with one lead, newest first. */
export async function thread(lead: string): Promise<Email[]> {
  const r = await api<{ items?: Email[] }>(
    `/emails?lead=${encodeURIComponent(lead)}&sort_order=desc&limit=10`,
  );
  return r.items ?? [];
}

export async function reply(to: Email, subject: string, html: string): Promise<unknown> {
  return api("/emails/reply", {
    method: "POST",
    body: JSON.stringify({ reply_to_uuid: to.id, eaccount: to.eaccount, subject, body: { html } }),
  });
}

/* ------------------------------------------------------- supersearch -- */

/** How many people match, without enriching or spending a credit. */
export async function countLeads(filters: Record<string, unknown>): Promise<number> {
  const r = await api<{ number_of_leads?: number }>("/supersearch-enrichment/count-leads-from-supersearch", {
    method: "POST",
    body: JSON.stringify({ search_filters: filters }),
  });
  return r?.number_of_leads ?? 0;
}

/**
 * Buy contacts: SuperSearch people with verified work addresses, into a list.
 * Spends one credit per verified address. Asynchronous: the list fills over
 * the next minutes, and `listLeads` reads it on a later run.
 */
export async function enrich(args: {
  filters: Record<string, unknown>;
  limit: number;
  listId?: string | null;
  listName: string;
}): Promise<{ id: string; resource_id: string }> {
  return api("/supersearch-enrichment/enrich-leads-from-supersearch", {
    method: "POST",
    body: JSON.stringify({
      search_filters: args.filters,
      limit: args.limit,
      work_email_enrichment: true,
      skip_rows_without_email: true,
      auto_update: false,
      ...(args.listId ? { resource_id: args.listId } : { list_name: args.listName }),
    }),
  });
}

export interface ListLead {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  company_domain?: string | null;
  website?: string | null;
  job_title?: string | null;
  verification_status?: number | null;
  payload?: Record<string, unknown> | null;
}

export async function listLeads(listId: string, limit = 100): Promise<ListLead[]> {
  const r = await api<{ items?: ListLead[] }>("/leads/list", {
    method: "POST",
    body: JSON.stringify({ list_id: listId, limit }),
  });
  return r.items ?? [];
}
