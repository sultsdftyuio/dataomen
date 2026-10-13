# Data pages: tables, filters, status, dashboards, charts

Distilled from Primer's data table guidance (`primer/design`), Carbon's
patterns and data-visualisation guidance
(`carbon-design-system/carbon-website`) and the FT Visual Vocabulary
(`Financial-Times/chart-doctor`). Applies to prospects, discovery, datasets
and the dashboard home. For chart styling and palettes, load the `dataviz`
skill too.

## Tables (prospect lists, datasets)

- Use a table when people compare items across the same attributes. Use a
  list or cards when rows have long text, mostly-empty columns, or need
  grouping.
- Table header: title, optional one-line subtitle, table-wide actions, and a
  filter/search input.
- The first column identifies the row (company name + domain) and is visually
  distinct; row actions sit in a final unlabelled column.
- Few columns; people scan rows more easily than columns. Hide secondary
  attributes behind a detail view or side panel.
- One data point per column, so sorting is unambiguous.
- Short headers; sortable headers are buttons with a visible sort direction.
- Numbers right-aligned with `tabular-nums`; dates in one consistent format;
  relative times ("3 days ago") with the absolute date on hover.
- Prefer wrapping to truncation; if you truncate, expose the full value.
- Leave empty cells blank (or a short phrase like "Not found") — not "-" or
  "x".
- Default order should be meaningful (best fit first, or newest first) and
  stated.
- Loading uses skeleton rows matching column widths and alignment.
- Pagination footer says where you are ("51–100 of 1,240").
- On small screens, the table scrolls inside its own container with the first
  column sticky, or collapses into a list.

## Filtering

- Single choice → dropdown or segmented control; multiple choice → checkbox
  group or multi-select.
- Multiple filter categories sit in a bar above the table or a left rail,
  never nested inside one dropdown.
- Instant updates when results are fast; batch with "Apply filters" when
  they are slow or people set many filters at once.
- Always show active filters as removable chips plus "Clear all", and show
  the result count.
- Zero results from filters is an empty state that names the filters.

## Status indicators (fit, enrichment, pilot status)

- Never use colour alone: pair it with an icon or shape and a text label.
- Icon + label where there's room or attention matters; a small shape + label
  in dense tables.
- Count badges only when the number matters; a dot when it doesn't.
- Deltas use a sign or an arrow (+12%, ▲), with colour as reinforcement.
- When statuses roll up, the group shows its most severe member.
- Keep a single status vocabulary across the product (e.g. Strong fit /
  Possible fit / Weak fit), with consistent colours.

## Dashboards

Decide which kind it is:

- **Presentation** (home overview): a few metrics that answer "what needs my
  attention?", the most important top-left, following an F-pattern. Cut
  anything that doesn't change a decision.
- **Exploration** (prospect analysis): search, sort, filter, drill-down;
  linked views update together; consistent layout and legend placement.

Both: one colour per series everywhere it appears, white space to group,
annotations that say what a number means ("12 new strong-fit prospects this
week"), not just the number.

## Choosing a chart (FT Visual Vocabulary)

Start from the relationship you want to show:

| Relationship   | Use for                                   | Typical charts                                   |
| -------------- | ----------------------------------------- | ------------------------------------------------ |
| Deviation      | Difference from a baseline or target      | Diverging bar, surplus/deficit line              |
| Correlation    | Relationship between two variables        | Scatterplot, connected scatter                    |
| Ranking        | Position in an ordered list               | Ordered bar, dot strip, lollipop                  |
| Distribution   | Spread of values                          | Histogram, dot plot, box plot                     |
| Change over time | Trends                                  | Line, column (few periods), slope                 |
| Part-to-whole  | Composition                               | Stacked bar, treemap (pie only with ≤3 parts)     |
| Magnitude      | Size comparison                           | Bar/column (zero baseline), pictogram             |
| Spatial        | Location matters                          | Choropleth, symbol map                            |
| Flow           | Movement between states                   | Sankey, waterfall                                 |

In Arcli, most questions are ranking (which prospects first), magnitude
(how many per segment) and change over time (signals per week). A sorted
bar or a plain number with a short trend line usually beats anything fancier.

## Colour in data

- Categorical palettes for unrelated groups, in a fixed order; sequential
  (one hue, light to dark) for ordered values; diverging only around a
  meaningful midpoint.
- Alert colours are reserved for status (red danger, orange/yellow warning,
  green success) — don't reuse them for categories.
- No gradients to encode value.
