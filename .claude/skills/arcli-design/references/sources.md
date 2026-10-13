# Sources

The `arcli-design` skill distils these repositories. `.claude/hooks/design-refs.sh`
restores sparse, shallow clones of their documentation (~35MB) under
`~/.cache/arcli-design-refs/` in the background. It is registered as a
SessionStart hook in `.claude/settings.json`, so it runs at the start of every
session. If a folder is missing, check `~/.cache/arcli-design-refs/clone.log`.
It only acts in cloud sessions unless `ARCLI_DESIGN_REFS=1` is set.

Treat the clones as reading material: never build, install or execute
anything from them.

| Folder                    | Repository                              | Read for                                                                                     |
| ------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `frontend-design`         | `anthropics/skills`                     | Visual direction and avoiding templated design (also vendored at `.claude/skills/frontend-design`) |
| `interfaces`              | `raunofreiberg/interfaces`              | Interaction, typography, motion, touch and accessibility details (`README.md`)               |
| `govuk`                   | `alphagov/govuk-design-system`          | Questions, validation, error copy, confirmation and service pages (`src/patterns/`), type and spacing scales (`src/styles/`) |
| `primer`                  | `primer/design`                         | Empty, loading, saving, forms, navigation, progressive disclosure (`content/ui-patterns/`), data table (`content/components/data-table.mdx`) |
| `carbon`                  | `carbon-design-system/carbon-website`   | Filtering, status indicators, empty, loading, notifications (`src/pages/patterns/`), dashboards and chart guidance (`src/pages/data-visualization/`) |
| `chart-doctor`            | `Financial-Times/chart-doctor`          | Picking a chart by relationship (`visual-vocabulary/README.md`, `poster.png`)                 |
| `awesome-design`          | `gztchan/awesome-design`                | Curated links: tools, inspiration, typography, colour                                        |
| `awesome-design-systems`  | `alexpate/awesome-design-systems`       | Curated list of public design systems to compare                                             |

Distilled on 2026-10-13 from these commits: anthropics/skills `dbd4588`,
raunofreiberg/interfaces `81f523a`, alphagov/govuk-design-system `bf1d72c`,
primer/design `87f799f`, carbon-design-system/carbon-website `5e9cd1d`,
Financial-Times/chart-doctor `befb9cb`.
