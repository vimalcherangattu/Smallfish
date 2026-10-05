/**
 * The 70 MB library that Next cannot see.
 *
 *     node stage0/tests/test_duckdb_trace.mjs
 *
 * ## The defect this exists to make loud
 *
 * `src/lib/supply.ts` reads the Overture Places release with DuckDB, which is
 * how a city nobody has extracted gets candidates. `@duckdb/node-bindings-linux-x64`
 * ships a **484 KB `duckdb.node` that dlopens a 70.5 MB `libduckdb.so` beside
 * it**. Next's file tracer follows the `require` and cannot follow the
 * `dlopen`, so the deployed function gets the stub without the library.
 *
 * Every signal says it is fine. The build is green, `npm run build` prints the
 * route, the whole suite passes, and `npx next start` serves it correctly —
 * because locally `node_modules` is on disk. The only thing that fails is the
 * deployed route, with a 500, after a push to `main` that is production.
 *
 * This repository has shipped that exact shape twice in one day — `/account`
 * answering a signed-out visitor with 404, and the credit pill rendering
 * milli-credits as credits — both with green builds and green suites. So the
 * trace is asserted here rather than trusted.
 *
 * ## It checks the config always, and the build when there is one
 *
 * The config check runs anywhere. The trace check needs `.next`, and skips with
 * a note rather than failing when there is no build — a test that fails for
 * want of a build is a test people learn to ignore.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) console.log(`  ok    ${name}`);
  else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n          ${detail}` : ""}`);
  }
};

/** Routes that import `supply.ts`, and therefore need the library. */
const ROUTES = ["/api/supply", "/api/jobs"];

// -------------------------------------------------------------- the config --

const config = readFileSync("next.config.mjs", "utf8");

check(
  "duckdb is an external server package",
  /serverExternalPackages\s*:\s*\[[^\]]*@duckdb\/node-api/s.test(config),
  "without it the build fails trying to resolve the darwin and musl bindings",
);

for (const route of ROUTES) {
  check(
    `${route} forces the native library into the trace`,
    new RegExp(
      `["']${route.replace(/\//g, "\\/")}["']\\s*:\\s*\\[[^\\]]*node-bindings-linux-x64`,
      "s",
    ).test(config),
    "outputFileTracingIncludes must name it — the tracer cannot see the dlopen",
  );
}

// ------------------------------------------------- the library on disk --

const lib = "node_modules/@duckdb/node-bindings-linux-x64/libduckdb.so";
if (existsSync(lib)) {
  const mb = statSync(lib).size / 1e6;
  console.log(`  note  libduckdb.so is ${mb.toFixed(1)} MB on disk`);
  check(
    "the library is comfortably inside Vercel's uncompressed function limit",
    mb < 200,
    `${mb.toFixed(1)} MB against a 250 MB ceiling for the whole function`,
  );
} else {
  console.log("  note  @duckdb/node-bindings-linux-x64 not installed; skipping the size check");
}

// --------------------------------------------------------------- the trace --

const built = ROUTES.map((r) => path.join(".next/server/app", r, "route.js.nft.json")).filter(
  existsSync,
);

if (!built.length) {
  console.log("  note  no build found; run `npm run build` to check the trace itself");
} else {
  for (const file of built) {
    const base = path.dirname(file);
    const trace = JSON.parse(readFileSync(file, "utf8"));
    const so = trace.files.filter((f) => f.endsWith("libduckdb.so"));
    const node = trace.files.filter((f) => f.endsWith("duckdb.node"));

    check(
      `${path.relative(".next/server/app", base)}: duckdb.node is traced`,
      node.length > 0,
      "the binding stub itself is missing, which is a different problem",
    );
    check(
      `${path.relative(".next/server/app", base)}: libduckdb.so is traced`,
      so.length > 0,
      "the function would deploy without the library and throw on first use — " +
        "check outputFileTracingIncludes in next.config.mjs",
    );
    for (const f of so) {
      check(
        `${path.relative(".next/server/app", base)}: the traced library exists where the trace says`,
        existsSync(path.resolve(base, f)),
        path.resolve(base, f),
      );
    }
  }
}

console.log(failures === 0 ? "\nall good" : `\n${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
