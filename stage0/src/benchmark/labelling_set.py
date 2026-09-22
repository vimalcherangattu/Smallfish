"""Build the hand-labelling set, and a browser tool to label it (S0-16).

Precision and recall are the two gate items no amount of engineering can
answer. A human has to look at businesses and say what the truth is. This
makes that work as small as it can honestly be, and no smaller.

Three decisions here are methodological, not cosmetic, and getting any of them
wrong would produce a number that looks like precision and is not:

**1. Labelling is blind.** The engine's verdict is not in the task file, not in
the HTML, and not recoverable from either. A labeller who can see that the
engine said "match" agrees with it more often — that is anchoring, and it
inflates precision by exactly the amount we are trying to measure. The verdicts
are joined back on afterwards, in `score.py`.

**2. The slice is complete, not the engine's output.** Recall asks "of the
businesses that truly match, how many did we find?" — a question you cannot
answer from a sample of what the engine already flagged, because the misses are
by definition not in it. So the set is *every* business in a sampled slice,
including ones the engine called no-match, couldn't-tell, or never read.

  …which makes precision ruinously expensive, because precision's denominator
  is only the engine's positive calls and those are ~9% of a slice. Measured:
  70 labels bought 6 positive calls and a 43.6–97.0% interval. Deciding the
  90% gate at a true 95% needs ~127 positive calls — about 2,200 randomly
  sampled businesses.

  So there are **two sampling designs, and they are not interchangeable**.
  `--enrich` oversamples the engine's positives, which is unbiased for
  precision (that metric is already conditioned on the same thing) and
  structurally inflates recall (the misses are absent by construction). The
  design is recorded in the exported file and `score.py` refuses to report
  recall from an enriched set, rather than relying on whoever runs it to
  remember which file was which.

**3. Unreadable sites are labelled too.** A business whose site we could not
fetch still has a truth: it either matches or it does not. Labelling those is
what separates "the engine was wrong" from "the engine could not see", and the
second is not a precision failure.

Output is a single self-contained HTML file. No server, no backend, no
dependencies: it holds the tasks inline, saves to localStorage as you go, and
exports a JSON file at the end. It can be emailed to a labeller who has never
seen this repository.

Usage:
    python3 stage0/src/benchmark/labelling_set.py --market dental-phoenix --n 100
    # open stage0/data/labelling/dental-phoenix.html, label, click Export
    # save the download to stage0/fixtures/labels-dental-phoenix.json
    python3 stage0/src/benchmark/score.py --market dental-phoenix
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "stage0" / "src"))

from engine.fetcher import FetchCache  # noqa: E402
from coverage.site_probe import normalise_url  # noqa: E402

APP = ROOT / "public" / "data"
DATA = ROOT / "stage0" / "data"
FIXTURES = ROOT / "stage0" / "fixtures"
OUT_DIR = ROOT / "stage0" / "data" / "labelling"

# Excerpt shown per page in the tool. Enough to judge most criteria without
# opening the site; the labeller is told to open it when this is not enough.
EXCERPT_CHARS = 1200


def build_tasks(
    market_id: str, n: int, seed: int, enrich: bool = False
) -> tuple[list[dict], list[dict], dict]:
    market = json.loads((APP / f"{market_id}.json").read_text())
    spec = json.loads((FIXTURES / "benchmarks.json").read_text())
    criteria = next(m for m in spec["markets"] if m["id"] == market_id)["criteria"]

    # The same seed as the benchmark run, so the labelled slice and the judged
    # slice overlap and the join in score.py is not mostly empty.
    pool = [b for b in market["businesses"] if b.get("site")]
    rng = random.Random(f"{seed}:{market_id}")
    rng.shuffle(pool)
    chosen = pool[:n]
    design = {"sampling": "complete_slice", "n": len(chosen)}

    if enrich:
        # Precision's denominator is the businesses the engine CALLED a match,
        # and at a ~9% positive rate a random slice spends eleven labels to buy
        # one. Measured consequence: 70 labels bought 6 positive calls and a
        # 43.6-97.0% interval. Deciding the 90% gate at a true 95% needs ~127
        # positive calls, which is ~2,200 randomly sampled businesses and is
        # not going to happen.
        #
        # So oversample the engine's positives. This is unbiased FOR PRECISION
        # — that metric is already conditioned on "the engine said match", and
        # conditioning the sample the same way changes nothing about it.
        #
        # It destroys recall, which needs a complete slice: the misses are by
        # definition absent from the engine's positives. `score.py` reads the
        # design recorded here and refuses to report recall from an enriched
        # set rather than trusting whoever runs it to remember.
        #
        # Blindness survives only because of the filler. A labeller who knows
        # every task is an engine match anchors on every task. The filler is
        # drawn from the same pool, shuffled in, and the composition is not
        # shown in the HTML.
        verdicts_path = DATA / f"verdicts-{market_id}.json"
        if not verdicts_path.exists():
            raise SystemExit(
                f"--enrich needs {verdicts_path.relative_to(ROOT)}: it samples "
                f"the engine's positive calls, so the engine has to have run.\n"
                f"  python3 stage0/src/benchmark/run.py --market {market_id} --limit 200"
            )
        engine = json.loads(verdicts_path.read_text())
        positive_ids = {
            bid for bid, verdicts in engine.items()
            if verdicts and all(v == "match" for v in verdicts.values())
        }
        by_id = {b["id"]: b for b in pool}
        positives = [by_id[i] for i in positive_ids if i in by_id]
        filler = [b for b in pool if b["id"] not in positive_ids][: max(n - len(positives), 0)]
        chosen = positives + filler
        rng.shuffle(chosen)
        design = {
            "sampling": "enriched_on_engine_positives",
            "n": len(chosen),
            "positives": len(positives),
            "filler": len(filler),
            # Stated in the file so a future reader does not have to infer it
            # from the counts, and so score.py's refusal has a reason to quote.
            "valid_for": ["precision"],
            "invalid_for": ["recall"],
            "why": (
                "Sampled on the engine's own positive calls. Precision is "
                "already conditioned on that, so it is unaffected. Recall's "
                "denominator is every true match, and the ones the engine "
                "missed are absent from this set by construction."
            ),
        }

    cache = FetchCache()
    tasks = []
    for b in chosen:
        url = normalise_url(b.get("site") or "") or ""
        read = cache.get(url) if url else None
        tasks.append({
            "business_id": b["id"],
            "name": b["name"],
            "site": url,
            "address": b.get("addr", ""),
            "category": b.get("cat", ""),
            # What the crawler saw, so the labeller can judge the same evidence
            # the engine had — and notice when the engine was reading the wrong
            # pages, which is a different failure from judging them wrongly.
            "fetch_outcome": read.outcome if read else "not fetched",
            "pages": [
                {"url": p.url, "excerpt": p.text[:EXCERPT_CHARS]}
                for p in (read.pages if read else [])
            ],
        })
    return tasks, criteria, design


HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Small Fish — labelling: __MARKET__</title>
<style>
  :root {
    --bg:#EEF0EC; --panel:#fff; --ink:#0E1520; --muted:#5B6470;
    --line:#D5D9D2; --accent:#4A6508; --accent-soft:#E4F5A6;
  }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
    --bg:#11161c; --panel:#171e26; --ink:#e8ecef; --muted:#9aa4af;
    --line:#2a333d; --accent:#C8F03C; --accent-soft:#2c3a12; } }
  * { box-sizing:border-box }
  body { margin:0; background:var(--bg); color:var(--ink);
    font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; }
  .wrap { max-width:820px; margin:0 auto; padding:24px 16px 80px }
  h1 { font-size:18px; margin:0 0 4px }
  .sub { color:var(--muted); font-size:13px; margin:0 0 18px }
  .card { background:var(--panel); border:1px solid var(--line);
    border-radius:10px; padding:16px; margin-bottom:14px }
  .biz { font-size:16px; font-weight:600 }
  .meta { color:var(--muted); font-size:12px; margin-top:2px }
  a { color:var(--accent) }
  .crit { border-top:1px solid var(--line); margin-top:14px; padding-top:12px }
  .q { font-weight:600; font-size:14px }
  .opts { display:flex; flex-wrap:wrap; gap:8px; margin-top:8px }
  .opts label { border:1px solid var(--line); border-radius:8px;
    padding:7px 11px; font-size:13px; cursor:pointer; user-select:none }
  .opts input { margin-right:6px }
  .rubric { color:var(--muted); font-size:12.5px; margin-top:5px;
    border-left:2px solid var(--line); padding-left:9px }
  .opts label:has(input:checked) { border-color:var(--accent);
    background:var(--accent-soft); font-weight:600 }
  details { margin-top:10px; font-size:13px }
  summary { cursor:pointer; color:var(--muted); font-size:12px }
  pre { white-space:pre-wrap; word-break:break-word; background:var(--bg);
    border:1px solid var(--line); border-radius:6px; padding:9px;
    font-size:12px; max-height:260px; overflow:auto; margin:8px 0 0 }
  .bar { position:fixed; left:0; right:0; bottom:0; background:var(--panel);
    border-top:1px solid var(--line); padding:10px 16px; display:flex;
    gap:12px; align-items:center; justify-content:space-between }
  button { background:var(--accent); color:#fff; border:0; border-radius:8px;
    padding:9px 15px; font-size:13px; font-weight:600; cursor:pointer }
  @media (prefers-color-scheme: dark) { button { color:#11161c } }
  button.ghost { background:transparent; color:var(--muted);
    border:1px solid var(--line); font-weight:400 }
  .note { background:var(--accent-soft); border-radius:8px; padding:11px 13px;
    font-size:13px; margin-bottom:18px; color:var(--ink) }
  .warn { color:var(--muted); font-size:12px; margin-top:6px }
</style></head><body><div class="wrap">
<h1>Labelling: __MARKET__</h1>
<p class="sub">__N__ businesses · __C__ criteria each · saves as you go</p>

<div class="note">
  <strong>What counts as the truth here:</strong> what the business's own public
  website shows, today. Not what is likely, not what the category suggests.
  <br><br>
  Open the site if the excerpt does not settle it — the excerpt is only the
  first part of each page we read. If the site is down or blocks you, and you
  cannot tell from anything public, choose <strong>can't tell</strong>. That is
  a real answer and the engine is scored on getting it right too.
  <br><br>
  If the website plainly belongs to a <em>different</em> business from the one
  named, choose <strong>this website isn't this business</strong>. That happens
  in the source data, and it is worth knowing separately — the engine reading
  the wrong company's site is not the same kind of mistake as misreading the
  right one.
  <br><br>
  You are <strong>not</strong> being shown what the engine decided. That is
  deliberate: seeing it would pull your answers toward it.
</div>

<div id="tasks"></div>

<div class="bar">
  <span id="progress" class="sub" style="margin:0"></span>
  <span>
    <button class="ghost" onclick="reset()">Clear</button>
    <button onclick="save()">Export labels</button>
  </span>
</div>
</div>
<script>
const TASKS = __TASKS__;
const CRITERIA = __CRITERIA__;
const MARKET = "__MARKET__";
const DESIGN = __DESIGN__;
// The enriched set and the complete slice are DIFFERENT DATASETS measuring
// different things, so they get different filenames and different
// localStorage keys. Sharing either would have the enriched run silently
// overwrite the complete slice — and the complete slice is the only thing
// that can measure recall, is the more expensive of the two to rebuild,
// and its loss would not be visible in any number.
const SUFFIX = DESIGN.sampling === "enriched_on_engine_positives" ? "-enriched" : "";
const KEY = "smallfish-labels-" + MARKET + SUFFIX;
const OPTIONS = [
  ["match", "Yes — it's true"],
  ["no_match", "No — it's false"],
  ["couldnt_tell", "Can't tell from anything public"],
  // Found by looking at the first business in the first generated set:
  // Overture lists "AAA Accurate Dental Care" with advancedsmilescenter.com,
  // which is a different company. Without this option a labeller has to pick
  // one of the three above, and the engine gets scored on a verdict about
  // somebody else's website. That is a data-source failure, not a judgment
  // failure, and conflating them would corrupt precision in a way no amount
  // of engine work could fix.
  ["wrong_site", "This website isn't this business"],
];

let labels = {};
try { labels = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { labels = {}; }

function set(bid, cid, v) {
  labels[bid] = labels[bid] || {};
  labels[bid][cid] = v;
  try { localStorage.setItem(KEY, JSON.stringify(labels)); } catch (e) {}
  progress();
}

function progress() {
  const total = TASKS.length * CRITERIA.length;
  let done = 0;
  for (const t of TASKS)
    for (const c of CRITERIA)
      if (labels[t.business_id] && labels[t.business_id][c.id]) done++;
  document.getElementById("progress").textContent =
    done + " of " + total + " labelled" + (done === total ? " — ready to export" : "");
}

function render() {
  const root = document.getElementById("tasks");
  root.innerHTML = "";
  TASKS.forEach((t, i) => {
    const card = document.createElement("div");
    card.className = "card";
    const host = t.site.replace(/^https?:\\/\\//, "").replace(/\\/$/, "");
    let html =
      '<div class="biz">' + (i + 1) + ". " + esc(t.name) + "</div>" +
      '<div class="meta">' + esc(t.category) + " · " + esc(t.address) + "</div>" +
      '<div class="meta">' + (t.site
        ? '<a href="' + esc(t.site) + '" target="_blank" rel="noopener">' + esc(host) + "</a>"
        : "no website") + "</div>";

    if (t.fetch_outcome !== "ok") {
      html += '<div class="warn">Our crawler could not read this site (' +
        esc(t.fetch_outcome) + "). Judge it from the live site if you can reach it.</div>";
    }
    if (t.pages.length) {
      html += "<details><summary>" + t.pages.length +
        " page(s) our crawler read</summary>";
      for (const p of t.pages)
        html += "<pre>" + esc(p.url) + "\\n\\n" + esc(p.excerpt) + "</pre>";
      html += "</details>";
    }

    for (const c of CRITERIA) {
      const cur = (labels[t.business_id] || {})[c.id];
      html += '<div class="crit"><div class="q">' + esc(c.text) + "?</div>" +
        (c.rubric ? '<div class="rubric">' + esc(c.rubric) + "</div>" : "") +
        '<div class="opts">' +
        OPTIONS.map(([v, lab]) =>
          '<label><input type="radio" name="' + t.business_id + "|" + c.id + '"' +
          (cur === v ? " checked" : "") +
          ' onchange="set(\\'' + t.business_id + "','" + c.id + "','" + v + '\\')">' +
          esc(lab) + "</label>").join("") +
        "</div></div>";
    }
    card.innerHTML = html;
    root.appendChild(card);
  });
  progress();
}

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g,
    ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function save() {
  // The sampling design travels with the labels. score.py reads it and
  // refuses to compute recall from a set that was enriched on the
  // engine's positives — a number that would look like recall and be
  // structurally inflated, because the misses are not in the sample.
  const out = { market: MARKET, labelled_at: new Date().toISOString(),
                design: DESIGN, labels: labels };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "labels-" + MARKET + SUFFIX + ".json";
  document.body.appendChild(a); a.click(); a.remove();
}

function reset() {
  if (!confirm("Clear every label for this market?")) return;
  labels = {};
  try { localStorage.removeItem(KEY); } catch (e) {}
  render();
}

render();
</script></body></html>
"""


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", default="dental-phoenix")
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--seed", type=int, default=20260921,
                    help="must match the benchmark run's seed, or the slices diverge")
    ap.add_argument(
        "--enrich", action="store_true",
        help="oversample the businesses the engine called a match, so the "
             "labels buy precision instead of mostly buying no_match. "
             "PRECISION ONLY: the resulting set cannot measure recall, and "
             "score.py enforces that.")
    args = ap.parse_args()

    tasks, criteria, design = build_tasks(
        args.market, args.n, args.seed, enrich=args.enrich)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    html = (HTML
            .replace("__TASKS__", json.dumps(tasks))
            # The rubric travels to the labeller AND to the judge, from one
            # place in benchmarks.json. Written twice it drifts, and the drift
            # is invisible: the engine and the ground truth would be answering
            # slightly different questions and every disagreement would look
            # like an engine error.
            .replace("__CRITERIA__", json.dumps(
                [{"id": c["id"], "text": c["text"], "rubric": c.get("rubric", "")}
                 for c in criteria]))
            .replace("__DESIGN__", json.dumps(design))
            .replace("__MARKET__", args.market)
            .replace("__N__", str(len(tasks)))
            .replace("__C__", str(len(criteria))))

    suffix = "-enriched" if args.enrich else ""
    out = OUT_DIR / f"{args.market}{suffix}.html"
    out.write_text(html)
    (OUT_DIR / f"{args.market}{suffix}-tasks.json").write_text(json.dumps(tasks, indent=2))

    fetched = sum(1 for t in tasks if t["fetch_outcome"] == "ok")
    print(f"{args.market}: {len(tasks)} businesses × {len(criteria)} criteria "
          f"= {len(tasks) * len(criteria)} labels")
    print(f"  {fetched} have pages our crawler read; "
          f"{len(tasks) - fetched} must be judged from the live site")
    print(f"\n→ {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB, self-contained)")
    if args.enrich:
        print(f"  {design['positives']} engine positives + {design['filler']} filler, shuffled.")
        print(f"  Open it, label, Export, then save the download as")
        print(f"  stage0/fixtures/labels-{args.market}-enriched.json")
        print(f"  python3 stage0/src/benchmark/score.py --market {args.market} --enriched")
        print(f"\n  It will NOT overwrite labels-{args.market}.json — that is the")
        print(f"  complete slice, and it is the only set that can measure recall.")
    else:
        print(f"  Open it, label, Export, then save the download as")
        print(f"  stage0/fixtures/labels-{args.market}.json and run score.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
