"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Arrow, Plus, Tick, Cross, Eye, Clock } from "@/components/app/icons";
import {
  addItem,
  criteriaForRead,
  describePlan,
  dropItem,
  planFromOffer,
  setPriority,
  setType,
  type Plan,
  type PlanItem,
} from "@/lib/icpplan";

/**
 * Describe what you sell. Get the plan we would run. Move it around. Save it.
 *
 * The owner's flow, 2026-10-08. The point of the screen is that **the plan is
 * editable before any money is spent, and nothing in it is a black box**: every
 * check is named in words, says how it gets settled, and sits in one of two
 * buckets that mean different things.
 *
 * ## Must-have and nice-to-have, not a score
 *
 * The owner chose this over 0–100 weights, resolving the fork
 * `docs/design-system.md` §5 had carried as unresolved. A must-have narrows the
 * list; a nice-to-have is reported on the row and never excludes anybody. So
 * dragging a check between the buckets changes the size of the answer, which is
 * the only reason to have two.
 *
 * ## Certainty is how it gets settled, not a percentage
 *
 * `observed` means a detector sees it in the page source — a Wix script is
 * there or it is not, no model, and it cannot come back "couldn't tell".
 * `read` means the pages that would show it get read. Every absence is `read`,
 * because not finding a thing is only proof once the pages that would carry it
 * have been read. Those are the only two the engine has, so they are the only
 * two shown.
 *
 * ## The refusals are the honest half
 *
 * Whatever the description names that no website states — head count, revenue,
 * funding, owner intent — comes back refused, with the reason and, where there
 * is one, the observable thing that gets at the same question. One list, from
 * `parseSearch`, so a word the search box rejects is rejected here too.
 */

const CERTAINTY: Record<PlanItem["certainty"], { label: string; detail: string }> = {
  observed: {
    label: "Seen on the page",
    detail: "A detector reads it out of the page source. No judgement, and it cannot come back unsure.",
  },
  read: {
    label: "Read to settle",
    detail: "We open the pages that would show it. If they do not settle it, you get “couldn’t tell”, never a guess.",
  },
};

function Check({
  item,
  onMove,
  onFlip,
  onDrop,
}: {
  item: PlanItem;
  onMove: () => void;
  onFlip: () => void;
  onDrop: () => void;
}) {
  const c = CERTAINTY[item.certainty];
  return (
    <li className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="between" style={{ gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <p className="t-h3" style={{ margin: 0 }}>
            {item.text}
          </p>
          <p className="t-s" style={{ marginTop: 4 }}>{item.how}</p>
        </div>
        {/* Why this check is here at all. A check somebody's own description
            asked for deserves different treatment from one we proposed. */}
        {item.fromOffer && (
          <span className="mono t-s" style={{ whiteSpace: "nowrap", color: "#5B6470" }}>
            from what you sell
          </span>
        )}
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span className="credit" style={{ height: 26, fontSize: 12, padding: "0 10px" }} title={c.detail}>
          {item.certainty === "observed" ? <Eye s={13} /> : <Clock s={13} />}
          {c.label}
        </span>
        <button type="button" className="qbtn" onClick={onMove}>
          {item.priority === "must" ? "Make it optional" : "Make it required"}
        </button>
        <button type="button" className="qbtn" onClick={onFlip}>
          {item.type === "absence" ? "They do have it" : "They do not have it"}
        </button>
        <button type="button" className="qbtn" onClick={onDrop} aria-label={`Remove ${item.text}`}>
          <Cross s={13} />
          Remove
        </button>
      </div>
    </li>
  );
}

export default function IcpPlan({
  initialOffer = "",
  initialName = "",
  initialId = null,
}: {
  initialOffer?: string;
  initialName?: string;
  initialId?: string | null;
}) {
  const [offer, setOffer] = useState(initialOffer);
  const [name, setName] = useState(initialName);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(initialId);

  const must = useMemo(() => plan?.items.filter((i) => i.priority === "must") ?? [], [plan]);
  const nice = useMemo(() => plan?.items.filter((i) => i.priority === "nice") ?? [], [plan]);

  const build = () => {
    setNote(null);
    setPlan(planFromOffer(offer));
  };

  /**
   * A document instead of typing.
   *
   * Plain text only, and said so rather than accepting a .docx and silently
   * reading its XML as prose. `planFromOffer` does not care where the words
   * came from, which is why the upload needs no second implementation.
   */
  const onFile = async (file: File | null) => {
    if (!file) return;
    if (!/\.(txt|md|csv)$/i.test(file.name)) {
      setNote("Plain text for now: .txt or .md. Paste the words in instead, it is the same thing to us.");
      return;
    }
    const text = await file.text();
    setOffer(text.slice(0, 20_000));
    setPlan(planFromOffer(text));
    setNote(null);
  };

  const save = async () => {
    if (!plan) return;
    setSaving(true);
    setNote(null);
    try {
      const res = await fetch("/api/icps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, name, offer, plan }),
      });
      const body = (await res.json()) as { ok?: boolean; reason?: string; icp?: { id: string } };
      if (body.ok && body.icp) {
        setId(body.icp.id);
        setNote("Saved.");
      } else {
        setNote(body.reason ?? "That did not save.");
      }
    } catch {
      setNote("Could not reach the server. The plan on screen is unchanged.");
    }
    setSaving(false);
  };

  // What the read will actually run. Empty is a real answer, not a failure:
  // no must-haves means nothing is excluded and the list is the businesses
  // themselves, read for their contact details.
  const running = plan ? criteriaForRead(plan) : [];
  const query = running.map((r) => r.text).join(" and ");

  return (
    <div className="col" style={{ gap: 26 }}>
      {/* ------------------------------------------------- what you sell -- */}
      <div className="col" style={{ gap: 10 }}>
        <label className="t-h3" htmlFor="offer">
          What do you sell, and who needs it?
        </label>
        <textarea
          id="offer"
          value={offer}
          onChange={(e) => setOffer(e.target.value)}
          rows={4}
          placeholder="We sell online booking software to dental practices that still take appointments by phone."
          style={{
            width: "100%", padding: "12px 14px", border: "1px solid #D5D9D2",
            borderRadius: 10, font: "400 15px/1.55 'Libre Franklin', sans-serif", resize: "vertical",
          }}
        />
        <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn ink" onClick={build} disabled={!offer.trim()}>
            Build the plan
            <Arrow s={16} />
          </button>
          <label className="qbtn" style={{ cursor: "pointer" }}>
            Upload what you have
            <input
              type="file"
              accept=".txt,.md,.csv,text/plain"
              style={{ display: "none" }}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {!offer.trim() && (
            <span className="t-s">Two sentences is enough. We turn it into checks, and show you each one.</span>
          )}
        </div>
      </div>

      {plan && (
        <>
          {/* ------------------------------------------- nothing to check -- */}
          {plan.nothingObservable && (
            <div className="card" style={{ padding: "18px 20px" }}>
              <p className="t-h3">Nothing in that is visible on a website.</p>
              <p className="t-b" style={{ marginTop: 8, maxWidth: "60ch", color: "#36404C" }}>
                That is a real answer rather than a failure to understand you. An offer whose
                need leaves no trace on a site cannot be found by reading sites. Add a check
                below if one of them is close, or search without any, and you get the
                businesses themselves with the contact details we found.
              </p>
            </div>
          )}

          {/* -------------------------------------------------- the plan -- */}
          <div className="col" style={{ gap: 14 }}>
            <div className="between" style={{ gap: 12, alignItems: "baseline" }}>
              <p className="t-h3" style={{ margin: 0 }}>Required, to be on the list</p>
              <span className="mono t-s">{must.length} of {running.length === must.length ? must.length : running.length}</span>
            </div>
            {must.length === 0 ? (
              <p className="t-s" style={{ maxWidth: "60ch" }}>
                None. Nothing is excluded, so you get every business we can read, with what
                we found on each. That is a real way to use this.
              </p>
            ) : (
              <ul className="col" style={{ gap: 10 }}>
                {must.map((i) => (
                  <Check
                    key={i.signalId}
                    item={i}
                    onMove={() => setPlan(setPriority(plan, i.signalId, "nice"))}
                    onFlip={() => setPlan(setType(plan, i.signalId, i.type === "absence" ? "presence" : "absence"))}
                    onDrop={() => setPlan(dropItem(plan, i.signalId))}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="col" style={{ gap: 14 }}>
            <p className="t-h3" style={{ margin: 0 }}>Worth knowing, but not a dealbreaker</p>
            {nice.length === 0 ? (
              <p className="t-s">Nothing here yet. Anything you move down is reported on the row and excludes nobody.</p>
            ) : (
              <ul className="col" style={{ gap: 10 }}>
                {nice.map((i) => (
                  <Check
                    key={i.signalId}
                    item={i}
                    onMove={() => setPlan(setPriority(plan, i.signalId, "must"))}
                    onFlip={() => setPlan(setType(plan, i.signalId, i.type === "absence" ? "presence" : "absence"))}
                    onDrop={() => setPlan(dropItem(plan, i.signalId))}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* --------------------------------------------- what we can add -- */}
          {plan.available.length > 0 && (
            <div className="col" style={{ gap: 10 }}>
              <p className="t-h3" style={{ margin: 0 }}>Everything else we can settle</p>
              <p className="t-s" style={{ maxWidth: "62ch" }}>
                The whole list, which is short on purpose. We only offer checks a website can
                actually answer.
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {plan.available.map((a) => (
                  <button
                    key={a.signalId}
                    type="button"
                    className="qbtn"
                    onClick={() => setPlan(addItem(plan, a.signalId, "nice"))}
                  >
                    <Plus s={13} />
                    {a.text}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ------------------------------------------------- refusals -- */}
          {plan.declined.length > 0 && (
            <div className="card" style={{ padding: "18px 20px" }}>
              <p className="t-h3">What we cannot check, and why</p>
              <ul className="col" style={{ gap: 12, marginTop: 10 }}>
                {plan.declined.map((d, n) => (
                  <li key={`${d.source}-${n}`}>
                    <p className="t-b" style={{ color: "#36404C" }}>
                      <strong>{d.source}</strong> — {d.why}
                    </p>
                    {d.proxy && (
                      <p className="t-s" style={{ marginTop: 3 }}>
                        Closest thing we could check: {d.proxy.text}
                        {d.proxy.provableToday ? "." : ", and we cannot settle that one yet either."}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* --------------------------------------------------- summary -- */}
          <div className="grp">
            <p className="t-b" style={{ maxWidth: "66ch" }}>{describePlan(plan)}</p>
            <div className="nextstep">
              <Link
                className="btn ink"
                href={query ? `/app?q=${encodeURIComponent(query)}` : "/app"}
              >
                {query ? "Find them" : "Pick a trade and a place"}
                <Arrow s={16} />
              </Link>
            </div>
          </div>

          {/* ------------------------------------------------------ save -- */}
          <div className="col" style={{ gap: 10 }}>
            <label className="t-h3" htmlFor="icp-name">Save this plan</label>
            <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
              <input
                id="icp-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Dentists with no booking"
                style={{
                  flex: "1 1 260px", padding: "10px 12px", border: "1px solid #D5D9D2",
                  borderRadius: 10, font: "400 15px/1.55 'Libre Franklin', sans-serif",
                }}
              />
              <button type="button" className="btn" onClick={save} disabled={saving || !name.trim()}>
                {saving ? "Saving…" : id ? "Update" : "Save"}
                <Tick s={15} />
              </button>
            </div>
            {note && <p className="t-s">{note}</p>}
          </div>
        </>
      )}
    </div>
  );
}
