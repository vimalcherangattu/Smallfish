/**
 * Candidates for a city nobody has touched (P0.2).
 *
 * ## What was broken, and for how long
 *
 * Only two things in this product could put work on a job: a market file we had
 * already extracted by hand, and a CSV the customer uploaded. So a search for a
 * trade and a city outside the four measured markets had nowhere to get
 * businesses from. `/api/jobs` took the request anyway and created a job with a
 * thousand promised websites and **no rows behind it**; the progress screen
 * read `0 of 1,000` for ever. Somebody sat and watched it — psychiatrists in
 * Dallas. It was then changed to decline the request honestly, which was better
 * and still a dead end.
 *
 * This is the missing half. It reads the public Overture Places release
 * directly over HTTPS and hands back real businesses with real websites, for
 * any trade in any US city, with no pre-extraction step.
 *
 * ## Measured, because the whole design turned on it
 *
 * Denver dentists — a city and trade the repository had never touched:
 * **1,581 found, 1,472 with a website, 7.1 seconds**, from Node, including
 * listing the release's sixteen parquet files. The `bbox` struct column gives
 * row-group pruning, so a city-sized query touches a few hundred MB of a
 * 10.5 GB dataset.
 *
 * Whole-country scans are a different matter — 133 seconds for a two-column
 * aggregate, because a country-sized box prunes nothing. **That is why there is
 * no pre-computed table of every city.** Per-city on demand is not a compromise
 * here, it is the only shape that works.
 *
 * ## Why DuckDB and not an API
 *
 * Google Places Text Search (New) hard-caps at 60 results — three pages of
 * twenty — against Overture's 3,009 for the same metro. "120 dentists in
 * Dallas" is not a thing Google can answer. Overture answered Denver with 1,581
 * in seven seconds. Places stays what `CLAUDE.md` says it is: gap-fill only,
 * place ids only. And Google Maps is never scraped.
 *
 * ## The one deployment trap
 *
 * `@duckdb/node-bindings-linux-x64` ships a 484 KB `duckdb.node` that
 * **dlopens a 70.5 MB `libduckdb.so` beside it**. Next's file tracer follows
 * the `require` and cannot see the `dlopen`, so the function bundle gets the
 * stub without the library: the build is green and the route throws at runtime.
 * `next.config.mjs` forces the `.so` into the trace with
 * `outputFileTracingIncludes`, and `stage0/tests/test_duckdb_trace.mjs` fails
 * if that stops being true. 71 MB uncompressed and 23.3 MB gzipped, against
 * Vercel's 250 MB and ~50 MB.
 */

import "server-only";

import type { Resolution } from "@/lib/region";

/** The release this reads. One string, so the candidates and `places-us.json`
 *  — whose city centres this query measures distance from — cannot drift onto
 *  different releases. */
export const RELEASE = "2026-08-19.0";

const S3_BASE = "https://overturemaps-us-west-2.s3.amazonaws.com/";

/** The product document's default city radius, and the one the four measured
 *  markets were extracted at, so a cold city is comparable to a warm one. */
export const RADIUS_MILES = 25;

const MILES_PER_DEG_LAT = 69.0;

export interface Candidate {
  /** Overture's own id, which is stable across releases and is what the job,
   *  the unlock ledger and the dedupe all key on. */
  id: string;
  name: string;
  cat: string;
  site: string;
  phone: string | null;
  addr: string | null;
  lat: number;
  lon: number;
}

export interface Supply {
  /** Listings in the region, in these categories. */
  listings: number;
  /** Of those, how many carry a website — the only ones we can read. */
  withSite: number;
  /** Present only when rows were asked for. */
  rows?: Candidate[];
  /** How long the query took, so a slow release shows up in logs rather than
   *  as a mystery timeout. */
  ms: number;
}

/**
 * The release's parquet files.
 *
 * Listed rather than globbed: DuckDB's `read_parquet` refuses a glob over plain
 * HTTP ("Globs (*) for generic HTTP file is are not supported"), which is a
 * thing you discover at runtime. Cached per container — the file list changes
 * only when the release does.
 */
let fileCache: string[] | null = null;

export async function placeFiles(): Promise<string[]> {
  if (fileCache) return fileCache;
  const prefix = `release/${RELEASE}/theme=places/type=place/`;
  const url = `${S3_BASE}?list-type=2&prefix=${encodeURIComponent(prefix)}&max-keys=1000`;
  const xml = await (await fetch(url)).text();
  const keys = [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)]
    .map((m) => m[1])
    .filter((k) => k.endsWith(".parquet"));
  if (!keys.length) throw new Error(`No parquet files for Overture release ${RELEASE}`);
  fileCache = keys.map((k) => S3_BASE + k.replace(/=/g, "%3D"));
  return fileCache;
}

/** A generous box around a point. The exact radius is a haversine in SQL. */
function box(lat: number, lon: number, miles: number) {
  const dlat = miles / MILES_PER_DEG_LAT;
  const dlon = miles / (MILES_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return { xmin: lon - dlon, xmax: lon + dlon, ymin: lat - dlat, ymax: lat + dlat };
}

/**
 * A connection, with the extension directory pointed somewhere writable.
 *
 * `INSTALL httpfs` writes to the home directory, and a serverless filesystem is
 * read-only apart from `/tmp`. Without this the first query fails with a
 * permission error that reads like a DuckDB bug.
 */
async function connect() {
  const { DuckDBInstance } = await import("@duckdb/node-api");
  const instance = await DuckDBInstance.create(":memory:", {
    home_directory: "/tmp",
    extension_directory: "/tmp/duckdb-extensions",
  });
  const con = await instance.connect();
  // `spatial` is not optional, and that was worth checking rather than
  // assuming. Overture's `bbox` looked like a cheap way to avoid the extension
  // — for a point, `xmin` would be the longitude. **It is not a point:** of
  // 153,497 Denver-area places, 152,785 have `xmin != xmax`. Reading `bbox.xmin`
  // as the longitude would have put every business at the west edge of its own
  // box and skewed every radius silently. `bbox` prunes row groups; `ST_X` and
  // `ST_Y` give the location.
  await con.run("INSTALL httpfs; LOAD httpfs;");
  await con.run("INSTALL spatial; LOAD spatial;");
  await con.run("SET enable_progress_bar=false");
  await con.run("SET http_keep_alive=true");
  await con.run("SET http_timeout=120000");
  return con;
}

/** Overture category ids, as they appear in `public/data/trades.json`. Checked
 *  rather than trusted: these reach a SQL string, and the taxonomy file is
 *  generated but the caller's list is not. */
const CATEGORY = /^[a-z0-9_]+$/;

/**
 * The SQL predicate for "within the region".
 *
 * A city resolution has one sample city; a state or country has up to eight,
 * spread by population, and a business counts when it is within the radius of
 * **any** of them. That is deliberately the same geometry `region.ts` describes
 * on screen — a state read is a sample of its largest cities and says so — so
 * the number quoted and the businesses read are the same set.
 */
function within(r: Resolution, radiusMiles: number = RADIUS_MILES) {
  const cities = r.sample.length ? r.sample : r.city ? [r.city] : [];
  if (!cities.length) return null;

  const boxes = cities.map((c) => box(c.center[1], c.center[0], radiusMiles));
  const bbox = {
    xmin: Math.min(...boxes.map((b) => b.xmin)),
    xmax: Math.max(...boxes.map((b) => b.xmax)),
    ymin: Math.min(...boxes.map((b) => b.ymin)),
    ymax: Math.max(...boxes.map((b) => b.ymax)),
  };

  const near = cities
    .map((c) => {
      const [lon, lat] = c.center;
      return `3958.8 * 2 * ASIN(SQRT(POW(SIN(RADIANS(ST_Y(geometry) - ${lat})/2),2)
        + COS(RADIANS(${lat})) * COS(RADIANS(ST_Y(geometry)))
        * POW(SIN(RADIANS(ST_X(geometry) - ${lon})/2),2))) <= ${radiusMiles}`;
    })
    .join(" OR ");

  return {
    // The box prunes row groups; the haversine makes the edge exact. Both are
    // needed: the box alone turns a 25-mile radius into a 50-mile square.
    sql: `bbox.xmin BETWEEN ${bbox.xmin} AND ${bbox.xmax}
          AND bbox.ymin BETWEEN ${bbox.ymin} AND ${bbox.ymax}
          AND (${near})`,
  };
}

/**
 * How many, and optionally which.
 *
 * `limit` caps the rows returned, never the count — the screen has to be able
 * to say "about 1,580 in Denver, we will read 420 of them", and those are two
 * different numbers that must both be true.
 *
 * `exclude` is business ids this workspace has already been given. Applied
 * **here**, in the query, rather than after: a customer who has had 400 Dallas
 * dentists and asks for 120 more should get the next 120, not 120 drawn from a
 * pool that is mostly theirs already.
 */
export async function supplyFor(
  categories: string[],
  region: Resolution,
  opts: {
    rows?: boolean;
    limit?: number;
    exclude?: Iterable<string>;
    /**
     * How far out to look, in miles. Defaults to `RADIUS_MILES`.
     *
     * It was a constant, which made "we read everything near Dallas and found
     * none of what you asked for" a dead end rather than a reason to look
     * further. A job widens this when its region runs out before its target is
     * met; see migration `0023`.
     */
    radiusMiles?: number;
  } = {},
): Promise<Supply> {
  const cats = categories.filter((c) => CATEGORY.test(c));
  if (!cats.length) return { listings: 0, withSite: 0, ms: 0, rows: opts.rows ? [] : undefined };

  const where = within(region, opts.radiusMiles ?? RADIUS_MILES);
  if (!where) return { listings: 0, withSite: 0, ms: 0, rows: opts.rows ? [] : undefined };

  const started = Date.now();
  const files = await placeFiles();
  const con = await connect();

  const fileList = files.map((f) => `'${f}'`).join(", ");
  const catList = cats.map((c) => `'${c}'`).join(", ");

  // **One scan, into a temp table.** The count and the rows are two questions
  // about the same set, and asking them as two queries scanned the release
  // twice: Denver dentists took 13.8s that way against roughly half of it now.
  // The budget matters — this runs inside a request.
  await con.run(`
    CREATE TEMP TABLE hits AS
    SELECT id,
           names.primary                 AS name,
           categories.primary            AS cat,
           websites[1]                   AS site,
           phones[1]                     AS phone,
           addresses[1].freeform         AS addr,
           ST_X(geometry)                AS lon,
           ST_Y(geometry)                AS lat
    FROM read_parquet([${fileList}])
    WHERE categories.primary IN (${catList})
      AND ${where.sql}
  `);

  // `len(websites) > 0` is **not** the same as having a website, and the
  // difference is not small: 4,388 of 133,828 Denver-area listings with a
  // non-empty `websites` array have a blank or null first entry — 3.3%. Counted
  // as readable they become job rows with nothing to fetch, which the worker
  // records as our failure, on a site that was never there.
  const READABLE = "site IS NOT NULL AND length(trim(site)) > 3";

  const counts = await con.run(
    `SELECT count(*), count(*) FILTER (WHERE ${READABLE}) FROM hits`,
  );
  // `getRows` hands back BigInt for a count. Stringify before Number, because
  // `JSON.stringify` on a BigInt throws and the failure surfaces as "Do not know
  // how to serialize a BigInt" from the route, nowhere near here.
  const [countRow] = await counts.getRows();
  const listings = Number(String(countRow[0]));
  const withSite = Number(String(countRow[1]));

  let rows: Candidate[] | undefined;
  if (opts.rows) {
    const excluded = [...(opts.exclude ?? [])].filter((id) => /^[\w-]+$/.test(id));
    const notThese = excluded.length
      ? `AND id NOT IN (${excluded.map((id) => `'${id}'`).join(", ")})`
      : "";
    const limit = Math.max(1, Math.min(opts.limit ?? 1000, 5000));

    const result = await con.run(`
      SELECT id, name, cat, site, phone, addr, lon, lat
      FROM hits
      WHERE ${READABLE} ${notThese}
      ORDER BY name
      LIMIT ${limit}
    `);
    rows = (await result.getRows()).map((r) => ({
      id: String(r[0]),
      name: String(r[1] ?? ""),
      cat: String(r[2] ?? ""),
      site: String(r[3]),
      phone: r[4] == null ? null : String(r[4]),
      addr: r[5] == null ? null : String(r[5]),
      lon: Number(r[6]),
      lat: Number(r[7]),
    }));
  }

  return { listings, withSite, rows, ms: Date.now() - started };
}
