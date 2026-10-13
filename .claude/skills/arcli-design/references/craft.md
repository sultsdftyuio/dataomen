# Interface craft

Distilled from Rauno Freiberg's Web Interface Guidelines
(`raunofreiberg/interfaces`), translated to this repo's stack (Next.js,
Tailwind v4, Radix/shadcn, next-themes).

## Interactivity

- Clicking a label focuses its input (`<label htmlFor>` or wrapping).
- Wrap inputs in a `<form>` so Enter submits.
- Give inputs the right `type` (`email`, `url`, `password`, `search`) and
  `autoComplete` value; turn `spellCheck` off for URLs, domains and codes.
- Input prefix/suffix icons sit inside the input (absolute + padding) and
  clicking them focuses the input.
- Toggles take effect immediately; no confirm step.
- Disable a submit button while its request is in flight to avoid duplicates
  (but see `states-and-forms.md`: don't disable it just because the form is
  invalid).
- Decorative layers (glows, gradients, overlays) get `pointer-events-none`.
- List and menu items have no dead gaps between them; use padding, not margin.
- Show feedback next to its trigger: an inline check on copy, not a toast;
  highlight the failing field, not just a banner.
- Update optimistically and roll back with a clear message on failure.
- Do auth redirects on the server so the URL doesn't jump after load.

## Typography

- Body is antialiased (already set in `globals.css`).
- No weights below 400. Medium headings look best at 500–600.
- Fluid headings use `clamp()`, e.g. `clamp(32px, 5vw, 56px)`.
- `tabular-nums` for numbers in tables, counters, timers and stats.
- Lines under ~80 characters (`max-w-prose` or `max-w-[65ch]`).
- `text-wrap: balance` for headings, `pretty` for short paragraphs.

## Motion

- Interaction animations ≤ 200ms.
- Proportional values: dialogs fade from scale ~0.95, buttons press to
  ~0.97 — never from 0 or to 0.8.
- No animation on frequent, low-novelty actions: context menus, adding or
  removing list rows, hovering ordinary buttons.
- Looping animations pause off-screen; better, avoid them.
- Theme switches must not trigger transitions (next-themes
  `disableTransitionOnChange`).
- Smooth-scroll to in-page anchors with a header offset
  (`scroll-margin-top`).

## Touch

- Hover styles only for hover-capable pointers.
- Input font ≥ 16px to stop iOS zoom on focus.
- Don't autofocus inputs on touch devices.
- Replace the iOS tap highlight with a visible pressed state if you remove it.

## Performance

- Large `blur()` / `backdrop-filter` values are slow; keep them small and rare.
- Use `will-change` only during an animation, not permanently.
- Write real-time values (drag, scroll) through refs, not React state.

## Accessibility

- Disabled buttons can't show tooltips to keyboard users; explain inline
  instead.
- Focus rings follow the radius (`ring` / box-shadow, not `outline` on old
  Safari).
- Arrow keys move through sequential lists and menus (Radix does this).
- Icon-only controls have `aria-label`; HTML-built illustrations have an
  `aria-label` instead of exposing their DOM.
- Hover tooltips never contain interactive content.
- Real images use `<img>` / `next/image` with meaningful `alt`.
- Gradient text resets its gradient in `::selection`.
- Nested menus need a forgiving pointer path (Radix submenus handle this).
