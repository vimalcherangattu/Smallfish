"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * It was not them — put it back on the list.
 *
 * The only action on the Contacted screen, because a record of who you wrote to
 * needs exactly one: undo. Somebody ticks the wrong row on a list of forty, and
 * a state they cannot leave is worse than one they can set.
 *
 * It removes the row optimistically and puts it back if the server refuses,
 * rather than showing a screen the database does not agree with.
 */
export default function UncontactButton({ businessId }: { businessId: string }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  return (
    <span className="flex items-baseline gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            const res = await fetch("/api/contacted", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ business: businessId, contacted: false }),
            });
            const body = (await res.json()) as { ok?: boolean };
            if (body.ok) router.refresh();
            else setFailed(true);
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
        className="sf-small text-[var(--muted)] underline underline-offset-2"
      >
        {busy ? "Removing…" : "Not contacted"}
      </button>
      {failed && (
        <span className="sf-small text-[var(--unsure)]">
          didn&rsquo;t save — still marked
        </span>
      )}
    </span>
  );
}
