/**
 * Event instrumentation (S1-11).
 *
 * The GTM plan asks for an event model into PostHog. What is here is the model
 * and a sink boundary; which analytics vendor receives it is a one-function
 * change and not worth coupling the product to.
 *
 * **Two rules, and they are the reason this is a file rather than a call to a
 * vendor SDK scattered through components.**
 *
 * 1. **No business identity leaves in an event.** A funnel needs to know that a
 *    scan matched 41 of 2,300, not which 41. Sending names to an analytics
 *    vendor would hand a third party the exact thing customers pay us for and
 *    that non-matching businesses never consented to.
 * 2. **Every event carries what it would take to disprove the funnel.** A
 *    "scan finished" event without the read count and the abort reason produces
 *    a dashboard that can only show success.
 */

export type EventName =
  | "search_confirmed"
  | "count_shown"
  | "scan_started"
  | "scan_stopped"
  | "match_unlocked"
  | "match_refunded"
  | "export_downloaded"
  | "checkout_started"
  | "checkout_blocked";

export type EventProps = Record<string, string | number | boolean | null>;

export type Event = {
  name: EventName;
  at: string;
  props: EventProps;
};

/** Keys that must never be sent, whatever a caller passes. */
const FORBIDDEN = /^(name|businessName|addr|address|phone|site|website|email|url|lat|lon|proof|reason|evidence|contact)$/i;

/**
 * Strip anything that identifies a business.
 *
 * Applied at the sink rather than trusted to every call site, because the call
 * site is where a hurried `...business` spread happens. Returns the kept props
 * and the names of what was dropped, so a caller that is leaking finds out.
 */
export function scrub(props: EventProps): { props: EventProps; dropped: string[] } {
  const kept: EventProps = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(props)) {
    if (FORBIDDEN.test(k)) dropped.push(k);
    else kept[k] = v;
  }
  return { props: kept, dropped };
}

export type Sink = (event: Event) => void;

const sinks: Sink[] = [];
export const addSink = (s: Sink) => sinks.push(s);
export const clearSinks = () => sinks.splice(0, sinks.length);

export function track(name: EventName, props: EventProps = {}): Event {
  const { props: safe, dropped } = scrub(props);
  if (dropped.length) {
    // Loud rather than silent: a dropped key means a call site tried to send
    // something it should not have, and that is a bug in the call site.
    safe.dropped_identifying_keys = dropped.join(",");
  }
  const event: Event = { name, at: new Date().toISOString(), props: safe };
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // Analytics must never be able to break the product.
    }
  }
  return event;
}

/**
 * The properties each event must carry to be worth having.
 *
 * Checked in tests rather than documented in a wiki, because the failure mode
 * is an event that fires for a year and turns out to answer nothing.
 */
export const REQUIRED_PROPS: Record<EventName, string[]> = {
  search_confirmed: ["criteria_count", "market"],
  count_shown: ["sampled", "matched", "band_credits", "projected_lo", "projected_hi"],
  scan_started: ["band_credits", "budget_reads", "balance_credits"],
  // Without a reason and the reads spent, a stopped scan cannot be told from a
  // finished one, and the abort's whole purpose is that it is explainable.
  scan_stopped: ["reason", "reads", "matched"],
  match_unlocked: ["band_credits", "milli_charged"],
  match_refunded: ["milli_refunded"],
  export_downloaded: ["rows", "withheld"],
  checkout_started: ["plan"],
  checkout_blocked: ["plan", "missing_count"],
};

export function missingProps(name: EventName, props: EventProps): string[] {
  return (REQUIRED_PROPS[name] ?? []).filter((k) => !(k in props));
}
