/** Reading this repository's own source as evidence, without being fooled by it.
 *
 *  Not a test — the leading underscore keeps it out of run_all.py's glob.
 *
 *  ## Why this exists
 *
 *  Several tests here assert things about the source itself: that a route is
 *  linked from somewhere, that a sentence was removed, that a guard is in place.
 *  Every one of them is wrong by default, because **this repository explains
 *  itself in prose**. Comments name routes, quote the copy they replaced and
 *  describe the defect they fixed, so a plain `includes` or `match` finds the
 *  explanation and reports the thing as present.
 *
 *  That is not hypothetical. It happened twice in one session:
 *
 *    - `test_reachable.mjs` passed while `/app/icp` had no link at all, because
 *      `AppNav.tsx` explains that it is not in the nav *by naming it*.
 *    - `test_optout_reach.mjs` reported the sentence "we cover four metro areas"
 *      still live after it had been deleted, because the commit's own comment
 *      quotes it to say what was wrong.
 *
 *  Two copies of the same stripper was the signal to put it in one place.
 */

/**
 * Source with comments blanked out and string literals left intact.
 *
 * Hand-rolled rather than regexed because the obvious regex is wrong in both
 * directions: `//` appears inside every `https://` string literal, and `/*`
 * appears inside the prose of the files being read. A scanner that tracks which
 * of the three states it is in gets both right, and there are few enough states
 * to read in one sitting.
 *
 * @param {string} src
 * @returns {string}
 */
export function code(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < src.length && src[i] !== "\n") i += 1;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < src.length) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}
