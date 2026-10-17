"use client";

import { useEffect, useRef } from "react";

/**
 * The logo's arc as a ripple: rings spreading from the glow in the rail's
 * bottom-left corner (see --rail-surface). The inner ring carries the
 * accent; outer rings get fainter and fade out as they rise (mask in
 * dashboard-shell.css). One accent ring pulses outwards through them
 * every few seconds, like a sonar ping; it is off for reduced motion.
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
  const svgRef = useRef<SVGSVGElement>(null);

  // The rail and the panel each run their own copy of the pulse, and the
  // panel mounts later when a page opens it. Pinning every copy's start to
  // the document timeline's zero keeps them in phase, so the pulse crosses
  // the border as one ring.
  useEffect(() => {
    svgRef.current?.getAnimations({ subtree: true }).forEach((animation) => {
      animation.startTime = 0;
    });
  }, []);

  // The panel's window onto the rings starts where the rail ends.
  const x = surface === "rail" ? 0 : RAIL_WIDTH;
  const width = surface === "rail" ? RAIL_WIDTH : RINGS[RINGS.length - 1].r - RAIL_WIDTH + 4;

  return (
    <svg
      ref={svgRef}
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
        <circle
          className="arc-ripples__pulse"
          cx="0"
          cy={HEIGHT}
          r={RINGS[0].r}
          stroke="var(--rail-accent)"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}
