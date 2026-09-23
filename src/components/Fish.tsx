/** The Small Fish mark, from the marketing design's own artwork.
 *
 *  Four elements: a tail, a body, an eye and a smile. The design uses it three
 *  ways — solid in the header and footer, and as a large thin outline behind
 *  the hero and the closing call to action — so the one component takes a
 *  `variant` rather than being copied three times with different fills.
 *
 *  Worth noting against `docs/design-system.md` §4, which bans fishy language
 *  and imagery: that rule is about the **UI**, and specifically about anything
 *  near a verdict or a piece of evidence, where a joke costs trust. The
 *  marketing site is where the brand is allowed to be a brand, and the design
 *  itself puts the fish there. Nothing in the product screens uses this. */
export default function Fish({
  variant = "solid",
  width = 39,
  className,
  strokeWidth,
}: {
  variant?: "solid" | "outline" | "solid-dark";
  width?: number;
  className?: string;
  /** Outline only. The design scales this down as the mark grows. */
  strokeWidth?: number;
}) {
  const outline = variant === "outline";
  const body = variant === "solid-dark" ? "#0E1520" : "#C8F03C";
  const detail = variant === "solid-dark" ? "#C8F03C" : "#0E1520";
  const stroke = strokeWidth ?? 0.35;

  return (
    <svg
      width={width}
      height={(width / 48) * 32}
      viewBox="0 0 48 32"
      role={variant === "outline" ? undefined : "img"}
      aria-label={variant === "outline" ? undefined : "Small Fish"}
      aria-hidden={variant === "outline" ? true : undefined}
      className={className}
    >
      <path
        d="M26 16 L44 5.5 Q41 16 44 26.5 Z"
        fill={outline ? "none" : body}
        stroke={outline ? "#C8F03C" : undefined}
        strokeWidth={outline ? stroke : undefined}
      />
      <circle
        cx="17"
        cy="16"
        r="12"
        fill={outline ? "none" : body}
        stroke={outline ? "#C8F03C" : undefined}
        strokeWidth={outline ? stroke : undefined}
      />
      <circle cx="11.5" cy="12.5" r="2.3" fill={outline ? "#C8F03C" : detail} />
      <path
        d="M9.5 21 Q13.5 25 19 24.6"
        fill="none"
        stroke={outline ? "#C8F03C" : detail}
        strokeWidth={outline ? stroke * 1.15 : 2}
        strokeLinecap="round"
      />
    </svg>
  );
}
