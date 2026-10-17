"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { usePathname } from "next/navigation";

import { readRailMotion, useRailMotion } from "./rail-motion";

/**
 * The logo's arc as a ripple: rings spreading from the glow in the rail's
 * bottom-left corner (see --rail-surface), with the accent ring as their
 * source. The other rings drift outwards very slowly, fading in at the
 * accent ring and out at the edge, and a single accent wave sweeps through
 * them when a page opens. Motion stops for reduced motion or when the
 * person turns it off in Settings (rail-motion.ts); the rings then rest in
 * place.
 *
 * The rings are centred on the rail's bottom-left corner. The context panel
 * sits flush against the rail and reaches the same bottom edge, so it draws
 * the same circles shifted by the rail's width and they carry on across the
 * border. Keep RAIL_WIDTH in step with .arc-rail's flex-basis.
 */
const RAIL_WIDTH = 72;
const HEIGHT = 280;
// The accent ring runs between the account button (about 52px from the
// corner) and the Settings icon (about 97px), so it never crosses one.
const SOURCE_RADIUS = 72;
const SPACING = 48;
// Opacity by radius: each drifting ring follows this as it travels, so a
// ring arriving at a radius looks exactly like the one that just left it.
const FALLOFF: Record<number, number> = { 72: 0, 120: 0.3, 168: 0.22, 216: 0.15, 264: 0.1, 312: 0 };
const DRIFTING = [72, 120, 168, 216, 264];
const OUTERMOST = DRIFTING[DRIFTING.length - 1] + SPACING;
const WAVE_MS = 3200;

// When the current page's wave started, on the document timeline. Shared so
// the rail and a panel that mounts later play the same wave in step.
let arrival: { pathname: string; at: number } | null = null;

function arrivalTime(pathname: string): number {
  if (arrival?.pathname !== pathname) {
    arrival = { pathname, at: Number(document.timeline.currentTime ?? 0) };
  }
  return arrival.at;
}

type RailRipplesProps = {
  /** Which surface draws them: the rail itself, or the panel beside it. */
  surface: "rail" | "panel";
};

export function RailRipples({ surface }: RailRipplesProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const waveRef = useRef<SVGCircleElement>(null);
  const pathname = usePathname();
  const motion = useRailMotion();

  // The rail and the panel each run their own drift, and the panel mounts
  // later when a page opens it. Pinning each drift's start to the document
  // timeline's zero keeps them in phase across the border. Re-run when the
  // drift restarts after motion is switched back on.
  useEffect(() => {
    svgRef.current?.getAnimations({ subtree: true }).forEach((animation) => {
      if ("animationName" in animation) animation.startTime = 0;
    });
  }, [motion]);

  // One wave per page. Both surfaces start it at the same moment; a panel
  // that mounts after the wave has passed simply shows nothing.
  useEffect(() => {
    const wave = waveRef.current;
    // readRailMotion: right after hydration `motion` is still the server's
    // "on" for one render, even when this device turned it off.
    if (!wave || !motion || !readRailMotion() || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = wave.animate(
      [
        { opacity: 0.85, transform: "scale(1)" },
        // Stays visible through the inner rings, then fades towards the edge.
        { opacity: 0.6, offset: 0.45 },
        { opacity: 0, transform: `scale(${OUTERMOST / SOURCE_RADIUS})` },
      ],
      { duration: WAVE_MS, easing: "cubic-bezier(.35, .3, .45, 1)" },
    );
    animation.startTime = arrivalTime(pathname);
    return () => animation.cancel();
  }, [pathname, motion]);

  // The panel's window onto the rings starts where the rail ends.
  const x = surface === "rail" ? 0 : RAIL_WIDTH;
  const width = surface === "rail" ? RAIL_WIDTH : OUTERMOST - RAIL_WIDTH + 4;

  return (
    <svg
      ref={svgRef}
      className={`arc-ripples arc-ripples--${surface}`}
      data-motion={motion ? "on" : "off"}
      width={width}
      height={HEIGHT}
      viewBox={`${x} 0 ${width} ${HEIGHT}`}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <g strokeWidth="1.5">
        {DRIFTING.map((r) => (
          <circle
            key={r}
            className="arc-ripples__drift"
            cx="0"
            cy={HEIGHT}
            r={r}
            stroke="currentColor"
            vectorEffect="non-scaling-stroke"
            style={{
              "--ripple-from": FALLOFF[r],
              "--ripple-to": FALLOFF[r + SPACING],
              "--ripple-scale": (r + SPACING) / r,
            } as CSSProperties}
          />
        ))}
        <circle cx="0" cy={HEIGHT} r={SOURCE_RADIUS} stroke="var(--rail-accent)" strokeOpacity="0.85" />
        <circle
          ref={waveRef}
          className="arc-ripples__wave"
          cx="0"
          cy={HEIGHT}
          r={SOURCE_RADIUS}
          stroke="var(--rail-accent)"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    </svg>
  );
}
