/**
 * The dot field: one dot per business we formed a view on, in the order the
 * data happens to sit, so the greens are scattered rather than arranged.
 *
 * Moved out of the home page on 2026-10-01 along with the rest of the method
 * blocks. A product that only shows fit and not-fit is claiming it always
 * knows; the third colour is the businesses we could not settle, and saying so
 * is the whole argument — which is why it belongs on `/how-we-check` rather
 * than under a sign-up button.
 */
export default function Dots({
  fit,
  notFit,
  unclear,
}: {
  fit: number;
  notFit: number;
  unclear: number;
}) {
  const total = fit + notFit + unclear;
  const cols = 38;
  const rows = Math.ceil(total / cols);
  // A fixed shuffle, not `Math.random()`: this renders on the server and again
  // in the browser, and a different arrangement between the two is a hydration
  // mismatch. Deterministic from the index, so both agree.
  const kind = (i: number) => {
    const h = (i * 7919) % total;
    if (h < fit) return "fit";
    if (h < fit + notFit) return "no";
    return "unclear";
  };
  const colour = { fit: "var(--lure)", no: "#D5D9D2", unclear: "#E6E1CC" } as const;

  return (
    <svg
      viewBox={`0 0 ${cols * 16} ${rows * 16}`}
      width="100%"
      className="dotfield"
      role="img"
      aria-label={`${total} businesses checked: ${fit} fit, ${notFit} did not, ${unclear} could not be told either way`}
      style={{ display: "block" }}
    >
      {Array.from({ length: total }, (_, i) => (
        <circle
          key={i}
          cx={(i % cols) * 16 + 8}
          cy={Math.floor(i / cols) * 16 + 8}
          r={4}
          fill={colour[kind(i)]}
        />
      ))}
    </svg>
  );
}
