"use client";

import { useEffect, useState } from "react";

/**
 * Where matched rows go (S2-02).
 *
 * The screen is mostly a list and a form, and the interesting part is what it
 * refuses. Each destination declares what it needs and what it cannot carry,
 * and the connect step checks before storing anything — a HubSpot portal
 * without the properties that hold the evidence is refused here rather than
 * discovered halfway through somebody's first push, with companies already
 * written and no reason attached to them.
 *
 * The credential is sealed before it is stored and never comes back. What is
 * shown instead is the last four characters, so a customer can tell which key
 * is connected without us being able to show it to them.
 */

type Destination = {
  id: string;
  kind: string;
  name: string;
  target: string | null;
  secret_hint: string;
  created_at: string;
};

type Spec = {
  kind: string;
  label: string;
  sends: boolean;
  requiresEmail: boolean;
  target: "campaign" | "endpoint" | null;
  setup: string | null;
  docs: string;
};

type Opted = {
  destination_kind: string;
  destination_name: string;
  business_id: string;
  external_id: string | null;
  remove_by: string;
};

export default function DestinationsPage() {
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  const [rows, setRows] = useState<Destination[]>([]);
  const [catalogue, setCatalogue] = useState<Record<string, Spec>>({});
  const [opted, setOpted] = useState<Opted[]>([]);

  const [kind, setKind] = useState("hubspot");
  const [secret, setSecret] = useState("");
  const [target, setTarget] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/integrations");
      const body = await res.json();
      if (!body.ok) {
        setReason(body.reason ?? "Could not load destinations.");
      } else {
        setReason(null);
        setRows(body.destinations ?? []);
        setCatalogue(body.catalogue ?? {});
        setOpted(body.optedOutAfterPush ?? []);
      }
    } catch {
      setReason("Could not reach the server.");
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const spec = catalogue[kind];

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, secret, target: target || null, name: name || undefined }),
      });
      const body = await res.json();
      if (!body.ok) setError(body.reason ?? "That did not connect.");
      else {
        setSecret("");
        setTarget("");
        setName("");
        await load();
      }
    } catch {
      setError("Could not reach the server.");
    }
    setSaving(false);
  }

  return (
    <div className="mx-auto max-w-[900px] px-6 py-10 sm:px-10">
      <h1 className="sf-h1">Where your matches go.</h1>
      <p className="sf-body mt-3 max-w-[64ch] text-[var(--ink-2)]">
        A CSV works without any of this. Connect a destination and matched rows
        go straight into it, with the sentence that proves each one travelling
        alongside — a row in a CRM that has lost its evidence is a row you
        cannot defend.
      </p>

      {reason && (
        <p className="sf-body sf-card mt-8 p-5 text-[var(--ink-2)]">{reason}</p>
      )}

      {/* --------------------------------------------------- what is connected */}
      {!loading && !reason && (
        <section className="mt-10">
          <h2 className="sf-h2">Connected</h2>
          {rows.length === 0 ? (
            <p className="sf-body mt-3 text-[var(--muted)]">
              Nothing yet. Exports still work — this is for sending matches
              somewhere automatically.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {rows.map((d) => (
                <div key={d.id} className="sf-card flex flex-wrap items-baseline gap-x-5 gap-y-1 p-5">
                  <span className="sf-h3">{d.name || catalogue[d.kind]?.label || d.kind}</span>
                  <span className="sf-data text-[var(--muted)]">{d.kind}</span>
                  {d.target && <span className="sf-data text-[var(--muted)]">{d.target}</span>}
                  <span className="sf-data ml-auto text-[var(--muted)]">key {d.secret_hint}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------- the opt-out follow-up --- */}
      {opted.length > 0 && (
        <section className="mt-12">
          <h2 className="sf-h2">Asked to be removed, after you pushed them</h2>
          <p className="sf-body mt-2 max-w-[66ch] text-[var(--ink-2)]">
            A row already in your CRM cannot be pulled back by us. What we can
            do is tell you exactly which records they are, because we kept the
            id your destination gave each one.
          </p>
          <div className="mt-4 space-y-2">
            {opted.map((o) => (
              <div key={`${o.destination_kind}-${o.business_id}`} className="sf-card p-4">
                <span className="sf-data">{o.destination_name || o.destination_kind}</span>{" "}
                <span className="sf-data text-[var(--muted)]">
                  record {o.external_id ?? "unknown"} · remove by {o.remove_by.slice(0, 10)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- connect one - */}
      {!reason && (
        <section className="mt-12">
          <h2 className="sf-h2">Connect one</h2>
          <form onSubmit={connect} className="sf-card mt-4 space-y-5 p-6">
            <div>
              <label className="sf-label" htmlFor="kind">Destination</label>
              <select
                id="kind"
                className="sf-input mt-1.5"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {Object.values(catalogue).map((s) => (
                  <option key={s.kind} value={s.kind}>{s.label}</option>
                ))}
              </select>
            </div>

            {/* What this destination cannot do, before the key is pasted rather
                than after the first push fails. */}
            {spec?.requiresEmail && (
              <p className="sf-small sf-pending rounded-lg p-3">
                {spec.label} needs an email address for every lead. We hold one
                only where the business publishes it on its own site — rows
                without one are refused and counted, never guessed from the
                domain.
              </p>
            )}
            {spec?.setup && (
              <p className="sf-small text-[var(--muted)]">{spec.setup}</p>
            )}

            <div>
              <label className="sf-label" htmlFor="secret">
                {kind === "webhook" ? "Signing secret" : "API key or private app token"}
              </label>
              <input
                id="secret"
                type="password"
                className="sf-input mt-1.5"
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                autoComplete="off"
                placeholder={kind === "webhook" ? "a secret only you and we know" : ""}
              />
            </div>

            {spec?.target && (
              <div>
                <label className="sf-label" htmlFor="target">
                  {spec.target === "campaign" ? "Campaign id" : "HTTPS endpoint"}
                </label>
                <input
                  id="target"
                  className="sf-input mt-1.5"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={spec.target === "endpoint" ? "https://hooks.example.com/small-fish" : ""}
                />
              </div>
            )}

            <div>
              <label className="sf-label" htmlFor="name">Name it (optional)</label>
              <input
                id="name"
                className="sf-input mt-1.5"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={spec?.label ?? ""}
              />
            </div>

            {error && <p className="sf-small text-[var(--unsure)]">{error}</p>}

            <button type="submit" className="sf-btn-lure" disabled={saving || !secret}>
              {saving ? "Checking…" : "Connect"}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
