/**
 * The database boundary (S1-08, S1-09).
 *
 * Same posture as `checkout.ts`: when the credentials are not there, say which
 * ones and what each would unlock, and never pretend. The difference is that
 * this one has a **working fallback**, and that is deliberate rather than
 * convenient — the suppression list has to be served whether or not a database
 * exists, because the alternative to serving it is showing a business that
 * asked to be left out.
 *
 * So there are two sources, and which one answered is part of the answer:
 *
 *   `db`     — Postgres. A removal takes effect on the next request.
 *   `static` — `public/data/suppressed.json`, committed to the repo. A removal
 *              takes effect on the next deploy, which means a person has to do
 *              something, which means the seven-day promise in S1-09 is kept by
 *              hand.
 *
 * The fallback is honest, not equivalent, and `source` is returned so a caller
 * can say so rather than implying a freshness it does not have.
 *
 * Reads go over PostgREST with `fetch` rather than through `@supabase/supabase-js`.
 * One GET does not justify a dependency, and the anon key is enough because the
 * suppression table's only policy is a public read of rows already in effect.
 * Writes are a different matter and will need the service role and a real
 * client; they are not written here, for the reason `checkout.ts` gives at
 * length.
 */

export const REQUIRED_ENV = [
  ["NEXT_PUBLIC_SUPABASE_URL", "where the database is"],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "read the public suppression list"],
  ["SUPABASE_SERVICE_ROLE_KEY", "write ledger entries and record removals, server-side only"],
] as const;

/** Read through `globalThis` so this compiles without node types — the tests
 *  build it standalone, and a rule that can only run inside Next.js is a rule
 *  that will not be tested. */
export const currentEnv = (): Record<string, string | undefined> =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } })
    .process?.env ?? {};

export function missingCredentials(
  env: Record<string, string | undefined> = currentEnv(),
): string[] {
  return REQUIRED_ENV.filter(([k]) => !env[k]).map(([k]) => k);
}

/** Enough to read the public list. The service role is a separate question. */
export function canRead(env: Record<string, string | undefined> = currentEnv()) {
  return !!(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Enough to write. Never reachable from a browser: RLS grants no client
 *  writes on any billing table, so a write needs this key in server code. */
export function canWrite(env: Record<string, string | undefined> = currentEnv()) {
  return canRead(env) && !!env.SUPABASE_SERVICE_ROLE_KEY;
}

export type Source = "db" | "static";

export type SuppressionList = {
  businessIds: string[];
  source: Source;
  /** Why the caller is getting what it is getting. Shown, not swallowed. */
  note: string;
};

/**
 * Every business suppressed and already in effect.
 *
 * `effective_at is not null` is the filter, and it is the whole point of that
 * column: a request inside its seven-day window is accepted but not yet
 * applied, and serving it early would be as wrong as serving it late — it would
 * mean a removal took effect before it was verified and processed.
 */
export async function fetchSuppressed(
  env: Record<string, string | undefined> = currentEnv(),
): Promise<SuppressionList | null> {
  if (!canRead(env)) return null;
  const url =
    `${env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")}` +
    `/rest/v1/suppressions?select=business_id&effective_at=not.is.null`;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const res = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`suppressions read failed: ${res.status} ${await res.text()}`);
  }
  const rows = (await res.json()) as Array<{ business_id: string }>;
  return {
    businessIds: rows.map((r) => r.business_id),
    source: "db",
    note: "Live from the database. A removal takes effect on the next request.",
  };
}

/** What the static file means, said in the same shape so a caller cannot treat
 *  the two as interchangeable without noticing. */
export function staticList(businessIds: string[]): SuppressionList {
  return {
    businessIds,
    source: "static",
    note:
      "From the file committed to the repository, because no database is " +
      "configured. A removal takes effect on the next deploy, so the " +
      "seven-day promise is currently kept by hand.",
  };
}

/** For a status page or a preflight: what is wired and what is not. */
export function status(env: Record<string, string | undefined> = currentEnv()) {
  const missing = missingCredentials(env);
  return {
    read: canRead(env),
    write: canWrite(env),
    missing,
    reason: missing.length
      ? `Missing ${missing.map((k) => `${k} (${REQUIRED_ENV.find(([n]) => n === k)![1]})`).join("; ")}.`
      : "Configured.",
  };
}
