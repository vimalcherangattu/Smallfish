import { rest } from "@/lib/prospecting";

/** Reading the counted rows for the /how-many pages. Service-role reads of
 *  public numbers; nothing here names a business. */
export interface CountRow {
  slug: string;
  trade: string;
  label: string;
  city: string;
  state: string;
  pop: number | null;
  listings: number;
  with_site: number;
  release: string;
  computed_at: string;
}

const COLS = "slug,trade,label,city,state,pop,listings,with_site,release,computed_at";

export async function countBySlug(slug: string): Promise<CountRow | null> {
  const rows = (await rest(`gtm_counts?slug=eq.${encodeURIComponent(slug)}&select=${COLS}&limit=1`).catch(() => null)) as CountRow[] | null;
  return rows?.[0] ?? null;
}

export async function countsForTrade(trade: string): Promise<CountRow[]> {
  return ((await rest(`gtm_counts?trade=eq.${encodeURIComponent(trade)}&select=${COLS}&limit=200`).catch(() => null)) as CountRow[]) ?? [];
}

export async function countsForCity(city: string, state: string): Promise<CountRow[]> {
  return (
    ((await rest(
      `gtm_counts?city=eq.${encodeURIComponent(city)}&state=eq.${state}&select=${COLS}&order=listings.desc&limit=60`,
    ).catch(() => null)) as CountRow[]) ?? []
  );
}

export async function allCounts(): Promise<CountRow[]> {
  return ((await rest(`gtm_counts?select=${COLS}&order=listings.desc&limit=5000`).catch(() => null)) as CountRow[]) ?? [];
}
