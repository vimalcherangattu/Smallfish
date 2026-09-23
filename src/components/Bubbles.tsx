/** Bubbles from the fish's mouth (marketing only).
 *
 *  The mark faces left, so they drift up and to the left. Three keyframe paths
 *  rather than one, with staggered delays and durations, because six bubbles on
 *  a single animation move as a block and read as a sprite rather than as air.
 *
 *  Values are the mockup's: sizes 6–18px, 1.4–1.6px lure outlines with one
 *  filled, durations 4.6–8s, delays out to 4.3s. They belong inside the fish's
 *  own container so they swim with it.
 */
/* Positions are percentages of the fish's own box, not pixels. The mockup
   gives them in px against a 780x520 mark; as soon as the mark became
   responsive those offsets drifted away from its mouth. 66/780 = 8.5%,
   236/520 = 45.4%, and so on. */
const HERO = [
  { left: 8.5, top: 45.4, size: 13, border: 1.6, dur: 5.4, delay: 0, path: "" },
  { left: 9.2, top: 47.3, size: 8, border: 1.4, dur: 6.6, delay: 0.9, path: "b2" },
  { left: 7.7, top: 44.2, size: 18, border: 1.6, dur: 7.4, delay: 1.8, path: "b3" },
  { left: 10.0, top: 48.5, size: 6, border: 0, dur: 4.6, delay: 2.6, path: "" },
  { left: 8.2, top: 46.2, size: 11, border: 1.5, dur: 6.1, delay: 3.4, path: "b2" },
  { left: 9.5, top: 46.9, size: 9, border: 1.4, dur: 5.8, delay: 4.3, path: "b3" },
];

const CLOSER = [
  { left: 8.5, top: 45.0, size: 12, border: 1.5, dur: 6.2, delay: 0.4, path: "" },
  { left: 9.6, top: 47.3, size: 7, border: 1.4, dur: 7.1, delay: 2.2, path: "b2" },
  { left: 7.7, top: 43.3, size: 15, border: 1.6, dur: 8, delay: 3.9, path: "b3" },
];

export default function Bubbles({
  where = "hero",
  colour = "#C8F03C",
  scale = 1,
}: {
  where?: "hero" | "closer";
  /** Ink on the lure block, lure on the dark hero. */
  colour?: string;
  /** Bubble size only; positions are percentages and need no scaling. */
  scale?: number;
}) {
  return (
    <>
      {(where === "hero" ? HERO : CLOSER).map((b, i) => (
        <span
          key={i}
          aria-hidden
          className={`bub ${b.path}`}
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.size * scale,
            height: b.size * scale,
            ...(b.border
              ? { border: `${b.border}px solid ${colour}` }
              : { background: colour }),
            animationDuration: `${b.dur}s`,
            animationDelay: `${b.delay}s`,
          }}
        />
      ))}
    </>
  );
}
