/**
 * The logo's arc as a ripple: rings spreading from the glow in the rail's
 * bottom-left corner (see --rail-surface). The inner ring carries the
 * accent; outer rings get fainter and fade out as they rise (mask in
 * dashboard-shell.css). Static on purpose.
 *
 * The rings are centred on the rail's bottom-left corner. The context panel
 * sits flush against the rail and reaches the same bottom edge, so it draws
 * the same circles shifted by the rail's width and they carry on across the
 * border. Keep RAIL_WIDTH in step with .arc-rail's flex-basis.
 */
const RAIL_WIDTH = 72;
const HEIGHT = 280;
// 48px apart. The first ring runs between the account button (about 52px
// from the corner) and the Settings icon (about 97px), so none crosses one.
const RINGS = [
  { r: 72, accent: true, opacity: 0.85 },
  { r: 120, opacity: 0.3 },
  { r: 168, opacity: 0.22 },
  { r: 216, opacity: 0.15 },
  { r: 264, opacity: 0.1 },
];

type RailRipplesProps = {
  /** Which surface draws them: the rail itself, or the panel beside it. */
  surface: "rail" | "panel";
};

export function RailRipples({ surface }: RailRipplesProps) {
  // The panel's window onto the rings starts where the rail ends.
  const x = surface === "rail" ? 0 : RAIL_WIDTH;
  const width = surface === "rail" ? RAIL_WIDTH : RINGS[RINGS.length - 1].r - RAIL_WIDTH + 4;

  return (
    <svg
      className={`arc-ripples arc-ripples--${surface}`}
      width={width}
      height={HEIGHT}
      viewBox={`${x} 0 ${width} ${HEIGHT}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g strokeWidth="1.5">
        {RINGS.map(({ r, accent, opacity }) => (
          <circle
            key={r}
            cx="0"
            cy={HEIGHT}
            r={r}
            stroke={accent ? "var(--rail-accent)" : "currentColor"}
            strokeOpacity={opacity}
          />
        ))}
      </g>
    </svg>
  );
}
