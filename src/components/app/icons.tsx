/**
 * The marks used by the App v2 screens, with the path data taken verbatim from
 * the artboards.
 *
 * One module, because `PRODUCT-HANDOFF.md` §3.8 — *"the fish is a drawn
 * outline, not an icon font, not a stock mark"* — only holds if there is one
 * copy of it. The previous screens inlined SVG wherever a glyph was wanted,
 * and the fish picked up three different eye positions that way.
 *
 * Every icon here is decorative and carries `aria-hidden`. The fish is the one
 * exception: it is the product's name in picture form, so it gets `role="img"`
 * and a label (§9).
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function Fish({ w = 32 }: { w?: number }) {
  return (
    <svg width={w} height={Math.round((w * 21) / 32)} viewBox="0 0 48 32" role="img" aria-label="Small Fish">
      <path d="M26 16 L44 5.5 Q41 16 44 26.5 Z" fill="#0E1520" />
      <circle cx="17" cy="16" r="12" fill="#0E1520" />
      <circle cx="11.5" cy="12.5" r="2.3" fill="#C8F03C" />
      <path d="M9.5 21 Q13.5 25 19 24.6" fill="none" stroke="#C8F03C" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const icon =
  (d: string | string[]) =>
  ({ s = 13 }: { s?: number }) => (
    <svg width={s} height={s} viewBox="0 0 24 24" {...stroke}>
      {(Array.isArray(d) ? d : [d]).map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );

export const Card = icon("M3 6h18v12H3zM3 10h18");
export const Mail = icon("M3 6h18v12H3zM3 7l9 6 9-6");
export const Phone = icon("M5 4h4l2 5-2.5 1.5a12 12 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1z");
export const Globe = icon("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M3 12h18M12 3c4 4.5 4 12.5 0 18M12 3c-4 4.5-4 12.5 0 18");
export const Copy = icon("M9 9h11v11H9zM5 15V4h11");
export const Eye = icon("M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z");
export const Tick = icon("M5 12l5 5 9-10");
export const Cross = icon("M6 6l12 12M18 6L6 18");
export const Arrow = icon("M5 12h14M13 6l6 6-6 6");
export const Back = icon("M19 12H5M11 18l-6-6 6-6");
export const Chevron = ({ s = 16 }: { s?: number }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" {...stroke} strokeWidth={1.8}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);
export const Down = icon("M12 15V3M7 8l5-5 5 5M4 15v5h16v-5");
export const Up = icon("M12 3v12M7 8l5-5 5 5M4 17v3h16v-3");
export const Map = icon("M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14");
export const Grid = icon("M4 4h16v16H4zM4 9h16M9.5 9v11");
export const Spark = icon("M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z");
export const Clock = icon("M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7.5V12l3 2");
export const Again = icon("M20 12a8 8 0 1 1-2.4-5.7M20.5 4.5V10h-5.5");
export const Pencil = icon("M4 20h4l11-11-4-4L4 16zM14 5l4 4");
export const List = icon("M4 6h16M4 12h16M4 18h10");
export const Flag = icon("M6 3h12v18l-6-5-6 5z");
export const Gift = icon([
  "M4 11h16v9H4zM12 11v9M3 7h18v4H3z",
  "M12 7C10 7 8 6 8 4.6S9.5 2.6 12 7zM12 7c2 0 4-1 4-2.4S14.5 2.6 12 7z",
]);
export const Plus = icon("M12 5v14M5 12h14");
