---
name: arcli-design
description: Arcli's design judgement for building or reshaping any page or UI in this repo — dashboard, prospects, datasets, discovery, onboarding, pilot, auth, settings, legal, or marketing pages. Load before writing or restyling JSX/CSS for a page, form, table, empty state, loading state, chart, or copy. Distilled from GOV.UK, Primer, Carbon, the FT Visual Vocabulary, Rauno Freiberg's interface guidelines and Anthropic's frontend-design skill, then fitted to Arcli's tokens.
---

# Arcli design

Arcli is a B2B prospect-intelligence tool. Its users are founders and sales
people who scan lists of companies, judge fit, and act. Pages should feel like
a precise instrument: calm, dense where data lives, generous where decisions
are made. Distinctiveness comes from the subject — prospects, signals,
evidence, fit — not from decoration.

For visual direction on a new marketing-style page, also load the
`frontend-design` skill (vendored next to this one). For charts, load
`dataviz`. This skill wins where they disagree about Arcli specifics.

## How to work

1. **Name the page's one job.** Who lands here, what they must decide or do,
   and what they do next. Every element earns its place against that job.
2. **Read what exists.** Check `app/globals.css`, `components/ui/`, and the
   feature's folder (`components/<feature>/`) before inventing anything.
   Reuse tokens and primitives; extend them rather than hard-coding.
3. **Plan before code.** Write a short plan: hierarchy (what is seen first,
   second, third), layout sketch (ASCII is fine), states (loading, empty,
   error, partial, success), and copy for headings, buttons and errors.
4. **Challenge the plan.** If any part is the generic default you'd produce
   for any SaaS page (see anti-patterns below), replace it with a choice made
   for this page, and say why.
5. **Build to the quality floor** (below), then critique: screenshot desktop
   and mobile if you can run the app (`run` skill), remove one accessory, fix
   what you see.

## Arcli's system (as of this skill's writing — re-check `app/globals.css`)

- **Theme:** light only. Tokens are OKLCH on `:root`, exposed to Tailwind via
  `@theme` (`bg-background`, `text-muted-foreground`, `border-border`,
  `bg-primary`, `chart-1..5`, `sidebar-*`).
- **Colour:** cool neutral greys (hue 260) and one blue primary
  (`--primary`, `oklch(0.55 0.18 260)`). Colour means something: primary for
  the main action and selection, destructive for danger, status colours for
  status. Everything else is neutral.
- **Type:** Geist Sans for UI, Geist Mono for code and identifiers only,
  Playfair Display (`.pfd` / `font-serif`) for occasional display headlines
  on marketing pages — never inside the dashboard.
- **Radius:** `--radius` is 6px; use `rounded-sm/md/lg` from the theme,
  varying radius with hierarchy rather than one radius everywhere.
- **Known debt — don't spread it:** `.btn-navy`, `.btn-blue`, `.btn-ghost`
  hard-code hex values that duplicate tokens; `.section-heading-icon` pulses
  forever; `.anim-float-*` and `.fu` add ambient and entrance motion. Prefer
  `components/ui/button` and tokens in new work. Don't add new hex values.

## Principles

**Hierarchy is the design.** One primary action per view. The most important
number or decision gets the most contrast and the top-left position; supporting
detail recedes. If everything is bold, nothing is.

**Structure carries meaning.** Borders, cards, dividers, numbering and labels
must encode something real (a group, a sequence, a boundary). Don't chop
content into identical cards; a table or a plain list with good spacing is
often better. Number things only if they are a sequence.

**Density where people scan, space where they decide.** Tables and lists are
compact with tabular numbers; forms, confirmation and pricing breathe.

**Words are interface.** Sentence case. Buttons say what happens ("Save
changes", "Add prospect", "Start pilot"), and the result uses the same verb
("Prospect added"). Name things as users understand them, not as the system
is built (a "brief", not a "crawl job"). No filler, no hype, no "please",
"sorry" or "oops".

**Motion answers actions.** Animate what the user caused (open, expand,
confirm) in ≤200ms with proportional values (scale from ~0.95, not 0). No
ambient loops, no fade-up on every section, no hover lifts on every card.
At most one orchestrated moment per marketing page. Respect
`prefers-reduced-motion`.

**Every state is designed.** A page isn't done until loading, empty, error,
partial and success states have each been decided — see
`references/states-and-forms.md`.

## Quality floor (always, without announcing it)

- Responsive to 360px wide with no horizontal page scroll; tables scroll
  inside their own container.
- Visible keyboard focus on everything interactive (ring token); icon-only
  buttons have `aria-label`; labels are real `<label>`s, never placeholders.
- Text contrast ≥ 4.5:1 (muted text included); UI boundaries ≥ 3:1.
- Inputs ≥ 16px font on mobile; touch targets ≥ 40px; no dead gaps between
  list items.
- `tabular-nums` and right alignment for numbers in tables and stats.
- Hover styles only under `@media (hover: hover)` (Tailwind v4's `hover:`
  already does this).
- Font weight never changes on hover/selected (layout shift).

## Anti-patterns (generic tells to avoid unless a brief asks)

- Tracked-out ALL-CAPS eyebrow above every heading; labels like
  "WORD — fragment"; meta joined with " · " everywhere; "→" on every link.
- One accented word in a headline (italic, gradient or colour).
- Big-number hero with gradient accent as the default hero.
- Grid of identical rounded cards with the same soft shadow; gradient washes
  and blurred orbs as decoration.
- Monospace for small labels that aren't code or IDs.
- Numbered markers (01/02/03) on content that isn't a sequence.
- Spinners for waits under a second; full-page loaders where a skeleton fits.
- "Something went wrong" / "Invalid input" / "This field is required".

## References

- `references/craft.md` — interaction, typography, motion, touch and
  accessibility details (Rauno Freiberg's interface guidelines).
- `references/states-and-forms.md` — forms, validation, error copy, saving,
  empty and loading states, confirmation pages (GOV.UK, Primer).
- `references/data-pages.md` — tables, filters, status indicators,
  dashboards and choosing a chart (Primer, Carbon, FT Visual Vocabulary).
- `references/sources.md` — the source repos, where the raw clones live in a
  cloud session, and what to read there for deeper questions.
