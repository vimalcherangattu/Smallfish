"use client";

import { useId, useState } from "react";
import { TONES, toned, type Email, type Lead, type Tone } from "@/lib/leads";
import { contactsFor, type Evidence } from "@/lib/appview";
import { Chevron, Copy, Cross, Eye, Globe, Mail, Pencil, Phone, Tick } from "@/components/app/icons";

/**
 * The business row — `.rowc`, and the product's central component (§6.1).
 *
 * ## Anatomy, from `AppRow.dc.html` rather than from the prose
 *
 * The evidence box and the contacts sit **inside** `.rowtop`'s left column,
 * under the reason sentence — not in a panel below it. The email well and the
 * action strip are siblings of `.rowtop`. Built from the §6.1 bullet list
 * instead, the expanded row grew a second indent level the stylesheet has no
 * padding for, and the evidence ended up further from the claim it supports
 * than the contacts were.
 *
 * ## The one place this departs from the handoff
 *
 * §6.1 says the expanded row opens with a **verbatim quote** from the business's
 * own site. For a *presence* verdict it does, and a presence row with no quote
 * does not render its claim — `evidenceFor` returns `missing` and this says so,
 * which is what §12 asks for ("it should fail loudly, not render blank").
 *
 * For an *absence* verdict there is nothing of theirs to quote and never will
 * be: you can quote the booking widget you found, you cannot quote the absence
 * of one. Measured — `proof` is on all 51 `no_match` rows of dental Phoenix and
 * none of the 42 matches. So the box shows the **search**: what we looked for
 * and how many of their pages we opened. A reader can repeat it.
 * `lib/appview.ts` carries the reasoning; the divergence is recorded in the
 * decision log and is **not** settled here.
 *
 * ## Tones are re-assemblies, not rewrites
 *
 * The four tones select and order the same clauses `composeEmail` built from
 * recorded evidence. None of them writes a new sentence about the business,
 * because a friendlier tone is not worth a claim nobody can check.
 */

export default function BizRow({
  lead,
  evidence,
  email,
  open,
  onToggle,
  onContacted,
  onNotAFit,
  contacted = false,
}: {
  lead: Lead;
  evidence: Evidence;
  email: Email | null;
  open: boolean;
  onToggle: () => void;
  onContacted?: () => void;
  onNotAFit?: () => void;
  contacted?: boolean;
}) {
  const [tone, setTone] = useState<Tone>("As written");
  const [copied, setCopied] = useState(false);
  const [showPages, setShowPages] = useState(false);
  const panel = useId();

  const body = email ? toned(email, tone) : lead.message;
  const contacts = contactsFor({ phone: lead.phone, email: lead.email, domain: lead.domain });
  const named = lead.name || "this business";

  return (
    <div className="rowc" style={open ? { borderColor: "#0E1520", boxShadow: "0 10px 30px rgba(14,21,32,.07)" } : undefined}>
      <div className="rowtop">
        <div style={{ minWidth: 0 }}>
          <p className="bname">{lead.locked ? "A business that fits" : lead.name}</p>
          {lead.town && <p className="btown">{lead.town}</p>}
          <p className="reason">{lead.why}</p>

          {open && !lead.locked && (
            <>
              <Ev ev={evidence} />
              <div className="cts2">
                {contacts.map((c) =>
                  c.value ? (
                    <span className="ct" key={c.kind}>
                      {c.kind === "phone" ? <Phone /> : c.kind === "email" ? <Mail /> : <Globe />}
                      {c.value}
                    </span>
                  ) : (
                    // Absent and named, never an empty chip and never a guess
                    // at info@domain (§3.6). Dashed, because the gap is a fact
                    // about their site, not a thing we failed at.
                    <span className="ct" key={c.kind} style={{ borderStyle: "dashed", color: "#5B6470" }}>
                      {c.absent}
                    </span>
                  ),
                )}
              </div>
            </>
          )}
        </div>

        <div className="col" style={{ gap: 10, alignItems: "flex-end" }}>
          {contacted && (
            <span className="ct" style={{ height: 26, fontSize: 12 }}>
              <Tick s={12} />
              contacted
            </span>
          )}
          {lead.has.message && !contacted && (
            <span className="ready">
              <Mail s={12} />
              email ready
            </span>
          )}
          <button
            type="button"
            className="chev"
            aria-expanded={open}
            aria-controls={panel}
            onClick={onToggle}
            style={open ? { transform: "rotate(90deg)" } : undefined}
          >
            <span className="sr-only">{open ? `Hide the detail for ${named}` : `Show the detail for ${named}`}</span>
            <Chevron />
          </button>
        </div>
      </div>

      {open && !lead.locked && (
        <div id={panel}>
          <div style={{ padding: "0 24px 20px" }}>
            {body ? (
              <div className="mailwell">
                <div className="hd">
                  <div style={{ minWidth: 0 }}>
                    <span className="t-h3">Your opening email</span>
                    {email && (
                      <p className="src" style={{ marginTop: 2 }}>
                        Subject: {email.subject}
                      </p>
                    )}
                  </div>
                  {email && (
                    <div className="row wrap" style={{ gap: 7 }} role="group" aria-label="Tone">
                      {TONES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="qbtn"
                          aria-pressed={t === tone}
                          onClick={() => setTone(t)}
                          style={t === tone ? { borderColor: "#0E1520", background: "#fff", fontWeight: 500 } : undefined}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="bd">
                  {body.split("\n\n").map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                  <p className="t-s" style={{ marginTop: 4 }}>
                    Every line points at something on their own site. You edit it and you send
                    it — we never send anything.
                  </p>
                </div>
              </div>
            ) : (
              // ~1 in 10 matches arrives with no draft, because `outreachFor`
              // refused rather than write a template. The row still exists and
              // still says why — the refusal is the honest half of the promise.
              <div className="mailwell">
                <div className="bd">
                  <p className="t-b">
                    No opening email for this one. Their site was reachable but carried too
                    little to write from, and we would rather give you nothing than a template.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Copy is this screen's one lure button (§5.2). There is no Send. */}
          <div className="rowacts">
            <button
              type="button"
              className="btn"
              disabled={!body}
              onClick={() => {
                if (!body) return;
                navigator.clipboard?.writeText(body).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  },
                  () => undefined,
                );
              }}
            >
              {copied ? "Copied" : "Copy email"}
              <Copy s={17} />
            </button>

            {lead.site && (
              <a className="qbtn" href={lead.site} target="_blank" rel="noreferrer noopener nofollow">
                <Globe />
                Open their site
              </a>
            )}

            <button type="button" className="qbtn" onClick={() => setShowPages((v) => !v)}>
              <Eye />
              See what we read ({lead.pagesRead} {lead.pagesRead === 1 ? "page" : "pages"})
            </button>

            {email && (
              <a className="qbtn" href={mailto(lead.email, email.subject, body ?? "")}>
                <Pencil />
                Edit in your email
              </a>
            )}

            <button type="button" className="qbtn" onClick={onContacted} disabled={!onContacted}>
              <Tick />
              {contacted ? "Contacted" : "Mark as contacted"}
            </button>

            <button type="button" className="qbtn" onClick={onNotAFit} disabled={!onNotAFit}>
              <Cross />
              Not a fit — refunds the credit
            </button>
          </div>

          {showPages && (
            <div style={{ padding: "14px 24px", borderTop: "1px solid #D5D9D2", background: "#fff" }}>
              <p className="t-s">
                We opened {lead.pagesRead} {lead.pagesRead === 1 ? "page" : "pages"} of{" "}
                {lead.domain ?? "their site"} and read the words on them. We store
                what we found, not copies of their pages, so the pages themselves are theirs to
                show — open the site and you are looking at what we looked at.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The evidence box. Three shapes, rendered differently on purpose — a search
 *  dressed as a quote would be the one dishonesty this product cannot afford. */
function Ev({ ev }: { ev: Evidence }) {
  if (ev.kind === "quote") {
    return (
      <div className="evbox">
        <p className="t-ev">
          <span className="mark">{ev.text}</span>
        </p>
        <p className="src">{ev.source}</p>
      </div>
    );
  }

  if (ev.kind === "absence") {
    return (
      <div className="evbox">
        {/* No `.mark`, no Fraunces quote styling: nothing here is theirs. */}
        <p className="t-b">
          {ev.lookedFor ? (
            <>
              We looked for {ev.lookedFor} on {ev.pages}{" "}
              {ev.pages === 1 ? "page" : "pages"} of their site and found none.
            </>
          ) : (
            // No catalogue entry, so there is no noun phrase to put after
            // "we looked for" — and no verb agreement that rescues it either:
            // vet Columbus's criterion is the bare predicate "not part of a
            // group", so every inlined shape reads wrong. Quoting the ask back
            // is the one form that is grammatical for *any* criterion text,
            // including ones nobody has written yet, which is the case the
            // second layer exists to cover.
            <>
              We read {ev.pages} {ev.pages === 1 ? "page" : "pages"} of their site against
              &ldquo;{ev.criterion}&rdquo; and found nothing that settles it the other way.
            </>
          )}
        </p>
        <p className="src">{ev.source}</p>
      </div>
    );
  }

  return (
    <div className="evbox" style={{ borderLeftColor: "#8A929B", borderLeftStyle: "dashed" }}>
      <p className="t-b">{ev.why}</p>
    </div>
  );
}

function mailto(to: string | null, subject: string, body: string): string {
  const q = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return `mailto:${to ?? ""}?${q}`;
}
