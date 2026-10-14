/**
 * Arcli brand colours for inline styles: `style={{ color: C.navy }}`.
 *
 * Each value is a `var(--c-*)` reference to app/globals.css, which holds the
 * real hex values and the semantic shadcn tokens built on them. Prefer the
 * Tailwind classes (`text-foreground`, `text-muted-foreground`, `border-border`,
 * `bg-primary`, `bg-success-pale text-success`) in new code; C exists for the
 * many inline styles that already use it.
 *
 * These strings only work where CSS is evaluated (style props, CSS strings,
 * SVG fill/stroke). Do not append alpha suffixes (`${C.blue}33`), do colour
 * maths on them, or pass them to next/og, email HTML or canvas. Use
 * `color-mix(in srgb, ${C.blue} 20%, transparent)` for transparency.
 *
 * Text contrast: use `C.subtle` (>= 4.5:1 on white, offWhite, blueTint and
 * bluePale) or `C.muted` for secondary text. `C.faint` is about 2.3:1, so use
 * it only for decorative strokes, dividers and icons beside a text label.
 */
export const C = {
  navy:      "var(--c-navy)",
  navyMid:   "var(--c-navy-mid)",
  navySoft:  "var(--c-navy-soft)",
  blue:      "var(--c-blue)",
  blueMid:   "var(--c-blue-mid)",
  blueLight: "var(--c-blue-light)",
  bluePale:  "var(--c-blue-pale)",
  blueTint:  "var(--c-blue-tint)",
  white:     "var(--c-white)",
  offWhite:  "var(--c-off-white)",
  rule:      "var(--c-rule)",
  ruleDark:  "var(--c-rule-dark)",
  muted:     "var(--c-muted)",
  /** Lightest text-safe grey. Use for captions and meta text. */
  subtle:    "var(--c-subtle)",
  /** Decorative only (strokes, dividers): fails text contrast. */
  faint:     "var(--c-faint)",
  text:      "var(--c-text)",
  // Darker foreground colors keep success, warning, and error text legible
  // at the small sizes used throughout the workspace UI.
  green:     "var(--c-green)",
  greenPale: "var(--c-green-pale)",
  amber:     "var(--c-amber)",
  amberPale: "var(--c-amber-pale)",
  red:       "var(--c-red)",
  redPale:   "var(--c-red-pale)",
} as const;
