import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** @type {import('next').NextConfig} */

/**
 * ## Why the hand-linked stylesheets carry a fingerprint
 *
 * `/handoff/site.css`, `/handoff/site.js` and `/app/kit.css` are linked by
 * hand, not imported, so Next does not hash their names — and `public/` is
 * served with `max-age=14400`. When the typeface changed on 2026-10-06 the
 * page's font link changed at once while a returning visitor kept the old
 * stylesheet for four hours, asking for a font no longer loaded. The film had
 * the same defect the day before. A query string from the file's own content
 * changes exactly when the file does.
 */
const v = (f) => createHash("sha1").update(readFileSync(new URL(`./public/${f}`, import.meta.url))).digest("hex").slice(0, 10);

/**
 * ## Why DuckDB needs two entries here, not one
 *
 * `src/lib/supply.ts` reads the Overture Places release over HTTPS with DuckDB,
 * which is how a city nobody has extracted gets candidates (P0.2).
 *
 * `serverExternalPackages` keeps the bundler's hands off it. Without it the
 * build **fails**, because `@duckdb/node-api` requires its binding by platform
 * and Turbopack tries to resolve all five:
 *
 *     Module not found: Can't resolve '@duckdb/node-bindings-darwin-arm64/duckdb.node'
 *
 * `outputFileTracingIncludes` is the one that is not obvious, and the one that
 * would have reached production. `@duckdb/node-bindings-linux-x64` ships a
 * 484 KB `duckdb.node` that **dlopens a 70.5 MB `libduckdb.so` beside it**. The
 * file tracer follows the require and cannot see the dlopen, so the function
 * bundle gets the stub and not the library. Locally it works — `node_modules`
 * is on disk — so the symptom is a green build, a clean local run, and a 500
 * from the deployed route. This repository has shipped that exact shape of
 * defect twice in one day; `stage0/tests/test_duckdb_trace.mjs` asserts the
 * `.so` is in the trace so the third time fails a test instead.
 *
 * Size: 71 MB uncompressed, 23.3 MB gzipped, against Vercel's 250 MB
 * uncompressed and ~50 MB compressed limits. Scoped to the two routes that need
 * it, so nothing else carries it.
 */
const nextConfig = {
  reactStrictMode: true,
  env: {
    SITE_CSS_V: v("handoff/site.css"),
    SITE_JS_V: v("handoff/site.js"),
    KIT_CSS_V: v("app/kit.css"),
  },
  serverExternalPackages: ["@duckdb/node-api"],
  outputFileTracingIncludes: {
    "/api/supply": ["./node_modules/@duckdb/node-bindings-linux-x64/**"],
    "/api/jobs": ["./node_modules/@duckdb/node-bindings-linux-x64/**"],
  },
};
export default nextConfig;
