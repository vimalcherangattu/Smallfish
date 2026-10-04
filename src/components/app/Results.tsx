"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import BizRow from "@/components/app/BizRow";
import ExportButton from "@/components/ExportButton";
import PushToDestination from "@/components/PushToDestination";
import { Arrow, Globe, Map } from "@/components/app/icons";
import { agree, type Evidence } from "@/lib/appview";
import type { Email, Lead } from "@/lib/leads";
import type { UnsureGroup } from "@/lib/unsure";

/**
 * The result screen — `AppResults`, §5.2.
 *
 * ## Three tabs, and the middle one is the product
 *
 * §5.2 names them **Fits · Couldn't tell · Not a fit**. The artboard draws
 * *All that fit · New since 2 Oct · Contacted* instead; the prose is the spec
 * and §5.4 then spends a section on the Couldn't-tell *tab*, so the prose wins.
 * Counts are always shown, zero included — §6.3: *"a zero tab is
 * information."*
 *
 * ## What is deliberately not here
 *
 * No sort control, no filter panel, no score column. The list arrives in
 * `matchedIn` order and stays in it: `unlock.ts` uses that same ordering for
 * the invoice, so a client-side re-sort would put different rows on the screen
 * than on the bill. §10's last row says the same thing for a different reason —
 * *"re-sorting a live list is how people lose the business they were reading."*
 */

export type Tab = "fits" | "unsure" | "no";

export interface ResultsProps {
  /** The search, restated as the person typed it. */
  what: string;
  where: string;
  criterion: string;
  /** When this market was read, if the probe recorded it. The per-row source
   *  lines carry their own dates; this is the one in the head sentence, and it
   *  is simply absent when nothing in the market file carries one. */
  readOn: string | null;
  rows: Array<{ lead: Lead; evidence: Evidence; email: Email | null }>;
  unsure: UnsureGroup[];
  didNotFit: number;
  /** Rows beyond the free preview, and what it takes to see them. */
  cost: {
    /** Rows shown in full without an account. */
    preview: number;
    /** Rows withheld. */
    locked: number;
    creditsEach: number;
    /** What signing up grants. Null when they already have an account, in
     *  which case the next rows are bought rather than granted. */
    freeGrant: number | null;
  } | null;
  /** How much of the market has been read, for the honest footnote. */
  read: number;
  withSite: number;
  unread: number;
  /** What the download would spend, so the button can say it before it is
   *  pressed. */
  marketId: string;
  criterionId: string;
  exportCost: number;
}

export default function Results(p: ResultsProps) {
  const [tab, setTab] = useState<Tab>("fits");
  const [open, setOpen] = useState<string | null>(p.rows[0]?.lead.id ?? null);
  const [contacted, setContacted] = useState<ReadonlySet<string>>(new Set());
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());

  const unsureTotal = useMemo(() => p.unsure.reduce((a, g) => a + g.count, 0), [p.unsure]);
  // Locked rows are counted, not listed.
  //
  // `buildLeads` returns them as rows whose every identifying field is already
  // null, so the component is not hiding anything — the data never arrived. But
  // rendering them produced twenty-three consecutive cards reading "A business
  // that fits · 4 pages read", which buries the three real ones and tells the
  // reader nothing twenty-three times. §6.4 has one place for "what this found
  // and what it takes to see it", and it is the cost bar.
  const shown = p.rows.filter((r) => !r.lead.locked && !dropped.has(r.lead.id));
  const fits = p.rows.filter((r) => !dropped.has(r.lead.id)).length;
  const thing = `${p.what} in ${p.where}`;

  return (
    <div className="appbody">
      <div className="between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div style={{ maxWidth: "72ch" }}>
          <h1 className="t-h1">
            {sentence(p.what, p.where, p.criterion)} —{" "}
            <span className="mono" style={{ fontWeight: 500 }}>
              {fits} fit
            </span>
            .
          </h1>
          <p className="t-s" style={{ marginTop: 9 }}>
            {p.readOn && <>Read {p.readOn} · </>}
            <Link href="/app" style={{ textDecoration: "underline", textUnderlineOffset: 3 }}>
              change what you asked for
            </Link>
          </p>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <Link className="qbtn" href="/app/explore">
            <Map />
            Where we looked
          </Link>
          {/* Not an `<a href="/api/export?…">`. That route is POST-only, so
              the link 405'd — and worse, a GET that worked would have written
              the file without going through `charging.ts`. The CRM push shipped
              with exactly that hole and it was invisible until the gate went
              on. `ExportButton` is the path that charges, and it prices itself
              on the label before anyone presses it. */}
          <PushToDestination market={p.marketId} criterion={p.criterionId} cost={p.exportCost} />
          <ExportButton
            market={p.marketId}
            criterion={p.criterionId}
            rows={fits}
            withheld={p.cost?.locked ?? 0}
            cost={p.exportCost}
            variant="primary"
            // `.btn.ink`, not lure. §12 allows exactly one lure-filled element
            // per screen and it belongs to Copy email in the open row.
            className="btn ink"
          />
        </div>
      </div>

      <div className="tabs2" role="tablist" aria-label="What we found">
        <Tab2 id="fits" tab={tab} set={setTab} label="Fits" n={fits} />
        <Tab2 id="unsure" tab={tab} set={setTab} label="Couldn't tell" n={unsureTotal} />
        <Tab2 id="no" tab={tab} set={setTab} label="Not a fit" n={p.didNotFit} />
      </div>

      {tab === "fits" && (
        <>
          {unsureTotal > 0 && (
            <div className="honest">
              <span className="unsure" aria-hidden="true">
                ?
              </span>
              <div>
                <p className="t-b">
                  <b>We couldn&rsquo;t tell on {unsureTotal} of them.</b> Rather than guess, we
                  left them out and said so. You were not charged for any of them.
                </p>
              </div>
              <button type="button" className="qbtn" onClick={() => setTab("unsure")}>
                See the {unsureTotal}
                <Arrow />
              </button>
            </div>
          )}

          {shown.length === 0 ? (
            <p className="t-b">
              Nothing is left on this list — every row has been marked as not a fit, and the
              credits went back.
            </p>
          ) : (
            <div>
              {shown.map((r) => (
                <BizRow
                  key={r.lead.id}
                  lead={r.lead}
                  evidence={r.evidence}
                  email={r.email}
                  open={open === r.lead.id}
                  onToggle={() => setOpen(open === r.lead.id ? null : r.lead.id)}
                  contacted={contacted.has(r.lead.id)}
                  onContacted={() => setContacted(add(contacted, r.lead.id))}
                  onNotAFit={() => setDropped(add(dropped, r.lead.id))}
                />
              ))}
            </div>
          )}

          <p className="t-s">
            We read{" "}
            <b className="mono" style={{ color: "#0E1520" }}>
              {p.read.toLocaleString()}
            </b>{" "}
            of the{" "}
            <b className="mono" style={{ color: "#0E1520" }}>
              {p.withSite.toLocaleString()}
            </b>{" "}
            {p.what} in {p.where} that have a website.
            {p.unread > 0 && ` ${p.unread.toLocaleString()} have not been opened yet.`}
          </p>

          {p.cost && p.cost.locked > 0 && <CostBar cost={p.cost} unsure={unsureTotal} />}
        </>
      )}

      {tab === "unsure" && (
        <Unsure groups={p.unsure} total={unsureTotal} thing={thing} back={() => setTab("fits")} fits={fits} />
      )}

      {tab === "no" && (
        <div className="card" style={{ padding: "22px 24px" }}>
          <p className="t-h2">
            <span className="mono" style={{ fontWeight: 500 }}>
              {p.didNotFit}
            </span>{" "}
            were checked and did not fit.
          </p>
          <p className="t-s" style={{ marginTop: 8, maxWidth: "64ch" }}>
            We opened their sites, found what you asked us to look for, and left them off the
            list. They are not shown by name because you did not ask for them and were not
            charged for them — a no is a finished answer, not a shorter list to work.
          </p>
        </div>
      )}
    </div>
  );
}

function Tab2({
  id,
  tab,
  set,
  label,
  n,
}: {
  id: Tab;
  tab: Tab;
  set: (t: Tab) => void;
  label: string;
  n: number;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      className={`tab2${tab === id ? " on" : ""}`}
      onClick={() => set(id)}
    >
      {label} <span className="n">{n}</span>
    </button>
  );
}

/** The couldn't-tell panel — `AppUnsure`, §5.4. Dashed, never amber, never a
 *  warning triangle: the judgement is open, not broken. */
function Unsure({
  groups,
  total,
  thing,
  back,
  fits,
}: {
  groups: UnsureGroup[];
  total: number;
  thing: string;
  back: () => void;
  fits: number;
}) {
  const ours = groups.filter((g) => g.ours).reduce((a, g) => a + g.count, 0);

  return (
    <>
      <div className="between" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
        <div style={{ maxWidth: "70ch" }}>
          <h1 className="t-h1">
            We couldn&rsquo;t tell on{" "}
            <span className="mono" style={{ fontWeight: 500 }}>
              {total}
            </span>{" "}
            {thing}.
          </h1>
          <p className="t-b" style={{ marginTop: 12, color: "#36404C", maxWidth: "60ch" }}>
            This is a real answer, not a failure. Their sites don&rsquo;t settle the question,
            and we would rather hand you a gap than a guess.{" "}
            {ours > 0 && (
              <>
                <b style={{ color: "#0E1520" }}>
                  {ours === total ? "All of these" : `${ours} of these`} are our own gap, not
                  theirs.
                </b>{" "}
              </>
            )}
            <b style={{ color: "#0E1520" }}>None of them cost you anything.</b>
          </p>
        </div>
        <button type="button" className="qbtn" onClick={back}>
          Back to the {fits} that fit
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        {groups.map((g) => (
          <div className="grp" key={g.id}>
            <div className="hd2">
              <p className="t-h2">{g.headline}</p>
              <span className="t-d m">{g.count}</span>
            </div>
            <p className="t-b" style={{ color: "#36404C", maxWidth: "60ch" }}>
              {g.detail}
            </p>
            <div className="row wrap" style={{ gap: 8 }}>
              {g.rows.map((r) =>
                r.domain ? (
                  <a
                    className="qbtn"
                    key={r.id}
                    href={`https://${r.domain}`}
                    target="_blank"
                    rel="noreferrer noopener nofollow"
                  >
                    {r.name}
                    <Globe s={12} />
                  </a>
                ) : (
                  <span className="qbtn" key={r.id}>
                    {r.name}
                  </span>
                ),
              )}
              {g.count > g.rows.length && (
                <span className="t-s">and {g.count - g.rows.length} more</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: "22px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <p className="t-h2">What you can do with these</p>
          <p className="t-s" style={{ marginTop: 7, maxWidth: "64ch" }}>
            Open them yourself — it takes a minute each and you&rsquo;ll know. Or ask for
            something else, and we will read them again for nothing.
          </p>
        </div>
        <Link className="btn white" href="/app">
          Look for something else
        </Link>
      </div>
    </>
  );
}

/**
 * §6.4. Ink panel, `.btn.white`, never lure — the lure on this screen is Copy
 * email inside the open row.
 *
 * ## Two different asks, which this used to run together
 *
 * A visitor with no account sees three rows (`FREE_PREVIEW`) and signing up
 * grants twenty, free, with no card. A customer who has spent their twenty buys
 * the next ones. The first version of this panel said *"23 more fit than your
 * free 3 · $0 today — card added at checkout"* to **both**, which told a
 * stranger they were about to be asked for a card to see rows the product
 * gives away, and told them their free allowance was three when the appbar
 * beside it said twenty.
 *
 * So the panel asks what is actually true of this reader: sign up, or top up.
 */
function CostBar({
  cost,
  unsure,
}: {
  cost: NonNullable<ResultsProps["cost"]>;
  unsure: number;
}) {
  const granted = cost.freeGrant !== null;
  // What signing up would actually show them: the grant, or everything that is
  // left if that is fewer. Never a number larger than there are rows.
  const freed = granted ? Math.min(cost.freeGrant!, cost.locked) : 0;
  const credits = cost.locked * cost.creditsEach;

  return (
    <div className="costbar">
      <div>
        <p className="t-h2" style={{ color: "#fff" }}>
          {granted ? (
            <>
              {cost.locked} more fit. The next {freed} are free.
            </>
          ) : (
            <>
              {cost.locked} more fit than the credits you have.
            </>
          )}
        </p>
        <p className="t-s" style={{ marginTop: 6 }}>
          {granted ? (
            <>
              You are seeing {cost.preview} without an account. Make one and we will show you{" "}
              {freed} more, with no card — one credit is one business that fits, and anything
              you mark &ldquo;not a fit&rdquo; comes straight back.
            </>
          ) : (
            <>
              One credit is one business that fits, and anything you mark &ldquo;not a
              fit&rdquo; comes straight back.
            </>
          )}
          {unsure > 0 && ` The ${unsure} we couldn't tell about stay free either way.`}
        </p>
        <div className="itemised">
          <span>{cost.preview} shown free</span>
          <span>·</span>
          <span>{cost.locked} more that fit</span>
          <span>·</span>
          {granted ? (
            <>
              <span>{freed} free on sign-up</span>
              <span>·</span>
              <span>no card</span>
            </>
          ) : (
            <>
              <span>
                {credits} credit{credits === 1 ? "" : "s"}
              </span>
              <span>·</span>
              <span>{cost.creditsEach} per business that fits</span>
            </>
          )}
        </div>
      </div>
      <Link className="btn white big" href={granted ? "/sign-up?source=results" : "/account"}>
        {granted ? `See ${freed} more, free` : `Get the other ${cost.locked}`}
        <Arrow s={17} />
      </Link>
    </div>
  );
}

function sentence(what: string, where: string, criterion: string): string {
  const c = criterion.trim();
  return `${cap(what)} in ${where}${c ? ` that ${agree(c)}` : ""}`;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const add = (s: ReadonlySet<string>, id: string) => new Set([...s, id]);
