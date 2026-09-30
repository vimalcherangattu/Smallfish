/**
 * The context a door hands to sign-up, and sign-up hands to the first list.
 *
 * The user-flow document's spine: *"Anything the user has told us (what they
 * sell, their city) is never asked again."* Six doors write what they know into
 * the sign-up link; this is the one place that decides what those keys are and
 * what is safe to carry, so a new door cannot invent its own spelling and a
 * stranger cannot smuggle something through one.
 *
 * ## Everything here arrives from a URL a stranger controls
 *
 * So everything is bounded and shaped on the way in. `market` and `criterion`
 * are ids that end up in a file path, so they are restricted to the shape an id
 * actually has; `source` becomes a database row; `q` and `sells` are free text
 * and are simply cut short. Nothing is trusted because a door claimed it.
 */

export interface Handoff {
  /** The search the door promised. */
  q: string | null;
  /** A read market's id, when the door knew one. */
  market: string | null;
  criterion: string | null;
  /** Which door: `for/acme`, `find/dental-phoenix`, `sample`, `home`. */
  source: string | null;
  /** What the visitor told a door they sell. */
  sells: string | null;
}

const ID = /^[a-z0-9_-]{1,60}$/;
/** A door name, which is a path fragment like `for/acme-agency`. */
const SOURCE = /^[a-z0-9/_-]{1,80}$/i;

const text = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, max) : null;
};

/** Read a handoff out of whatever the URL carried. */
export function readHandoff(sp: Record<string, string | string[] | undefined>): Handoff {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const id = (k: string) => {
    const v = text(one(k), 60);
    return v && ID.test(v) ? v : null;
  };
  const src = text(one("source"), 80);
  return {
    q: text(one("q"), 200),
    market: id("market"),
    criterion: id("criterion"),
    source: src && SOURCE.test(src) ? src : null,
    sells: text(one("sells"), 80),
  };
}

/** Put it back on a URL, dropping what is absent so links stay short. */
export function handoffParams(h: Handoff): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(h)) if (v) p.set(k, v);
  return p;
}

/**
 * Where somebody goes once they have an account.
 *
 * Straight to their list when a door told us what they wanted, which is the
 * whole promise: *"see your market → sign up → get your first list in two
 * minutes"*. With no context there is nothing to run, so they land on the
 * search box rather than a dashboard of counters.
 */
export function firstStop(h: Handoff): string {
  return h.q ? `/app?q=${encodeURIComponent(h.q)}` : "/app";
}

export const isEmpty = (h: Handoff) =>
  !h.q && !h.market && !h.criterion && !h.source && !h.sells;
