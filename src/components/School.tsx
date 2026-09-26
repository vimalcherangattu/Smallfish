/**
 * The school of fish behind the hero and the footer.
 *
 * The design supplies this as roughly two hundred hand-written `<use>`
 * elements. Generated instead: the same picture, and a row offset or a spacing
 * change is one number here rather than a search-and-replace across a wall of
 * coordinates that nobody will ever diff.
 *
 * Purely decorative, so `aria-hidden` and no accessible name. A screen reader
 * announcing two hundred fish before the headline would be the single worst
 * thing on the page.
 */

export default function School({
  width,
  height,
  stroke = "#1B2533",
  spacingX = 72,
  spacingY = 62,
  className,
  style,
}: {
  width: number;
  height: number;
  stroke?: string;
  spacingX?: number;
  spacingY?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const cols = Math.ceil(width / spacingX) + 1;
  const rows = Math.ceil(height / spacingY);

  const uses: { x: number; y: number }[] = [];
  for (let r = 0; r < rows; r += 1) {
    // Alternate rows sit half a step over, so the grid reads as a shoal
    // rather than as wallpaper.
    const offset = r % 2 === 0 ? -30 : 6;
    for (let c = 0; c < cols; c += 1) {
      uses.push({ x: offset + c * spacingX, y: r * spacingY });
    }
  }

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
      focusable="false"
      className={className}
      style={style}
    >
      <defs>
        <g id="sf-school">
          <path
            d="M26 16 L44 5.5 Q41 16 44 26.5 Z"
            fill="none"
            stroke={stroke}
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="17" cy="16" r="11.2" fill="none" stroke={stroke} strokeWidth="1.4" />
          <circle cx="11.5" cy="12.5" r="1.7" fill={stroke} />
        </g>
      </defs>
      {uses.map((u) => (
        <use key={`${u.x}-${u.y}`} href="#sf-school" x={u.x} y={u.y} />
      ))}
    </svg>
  );
}
