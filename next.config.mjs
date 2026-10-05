/** @type {import('next').NextConfig} */

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
  serverExternalPackages: ["@duckdb/node-api"],
  outputFileTracingIncludes: {
    "/api/supply": ["./node_modules/@duckdb/node-bindings-linux-x64/**"],
    "/api/jobs": ["./node_modules/@duckdb/node-bindings-linux-x64/**"],
  },
};
export default nextConfig;
