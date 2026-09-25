/** Compile `src/lib/*.ts` to plain ESM so node can test it directly.
 *
 *  Not a test — the leading underscore keeps it out of run_all.py's glob.
 *
 *  Two things here exist because they were got wrong first. A temp tsconfig is
 *  used rather than CLI flags, because the sources import through the project's
 *  "@/*" path alias and tsc only reads `paths` from a config file. And
 *  `rootDir` is explicit, because without it tsc infers it from the common
 *  parent of the inputs, so the emitted path moves when the input list changes.
 *
 *  tsc resolves the alias for type checking but emits the specifier unchanged,
 *  so every "@/lib/x" is rewritten to "./x.js" afterwards.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** @param {string[]} sources repo-relative .ts paths, dependencies included */
export function compileLib(sources, prefix = "sf-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const tsconfig = join(dir, "tsconfig.json");

  writeFileSync(
    tsconfig,
    JSON.stringify({
      compilerOptions: {
        outDir: dir,
        rootDir: process.cwd(),
        module: "esnext",
        target: "es2022",
        moduleResolution: "bundler",
        skipLibCheck: true,
        strict: true,
        noEmit: false,
        baseUrl: process.cwd(),
        paths: { "@/*": ["./src/*"] },
        // `deliver.ts` imports `node:crypto`. Without this, tsc cannot resolve
        // a builtin and fails the whole compile — which looks like a broken
        // test rather than a missing type package.
        //
        // `typeRoots` has to be absolute: the generated tsconfig lives in a
        // temp directory, and the default is resolved relative to the config
        // file, so tsc looks for `/tmp/…/node_modules/@types` and finds
        // nothing.
        types: ["node"],
        typeRoots: [join(process.cwd(), "node_modules", "@types")],
      },
      files: sources.map((f) => join(process.cwd(), f)),
    }),
  );
  execFileSync("npx", ["tsc", "-p", tsconfig], { stdio: "pipe" });

  for (const f of sources) {
    const out = join(dir, f.replace(/\.ts$/, ".js"));
    writeFileSync(
      out,
      readFileSync(out, "utf8").replace(
        /from ["']@\/lib\/([\w-]+)["']/g,
        'from "./$1.js"',
      ),
    );
  }

  return {
    dir,
    /** @param {string} name module basename under src/lib */
    load: (name) =>
      import(pathToFileURL(join(dir, "src", "lib", `${name}.js`)).href),
  };
}
