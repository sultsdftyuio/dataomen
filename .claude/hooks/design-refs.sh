#!/usr/bin/env bash
# Restores the raw design reference repos that the arcli-design skill was
# distilled from, so a cloud session can read the originals for questions the
# skill doesn't answer. Cloud containers are ephemeral, hence a SessionStart
# hook rather than a one-off clone.
#
# Safety and cost decisions:
# - Cloud sessions only: never downloads ~35MB onto a developer's machine
#   unasked. Set ARCLI_DESIGN_REFS=1 to opt in locally.
# - Runs detached and always exits 0, so a slow or blocked network never
#   delays or breaks session start.
# - Shallow, blobless, sparse clones of documentation paths only.
# - Clones live outside the repo; they are reference material, never built
#   or executed.
set -u

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && [ "${ARCLI_DESIGN_REFS:-}" != "1" ]; then
  exit 0
fi

DEST="${ARCLI_DESIGN_REFS_DIR:-$HOME/.cache/arcli-design-refs}"
LOG="$DEST/clone.log"
mkdir -p "$DEST" || exit 0

# name|repo|sparse patterns (space separated, non-cone gitignore style)
REPOS='
frontend-design|anthropics/skills|/skills/frontend-design/
interfaces|raunofreiberg/interfaces|/README.md
govuk|alphagov/govuk-design-system|/src/patterns/ /src/styles/ /src/components/ /src/get-started/ /src/accessibility/
primer|primer/design|/content/ui-patterns/ /content/foundations/ /content/components/
carbon|carbon-design-system/carbon-website|/src/pages/patterns/ /src/pages/data-visualization/ /src/pages/guidelines/
chart-doctor|Financial-Times/chart-doctor|/README.md /visual-vocabulary/README.md /visual-vocabulary/poster.png
awesome-design|gztchan/awesome-design|/README.md
awesome-design-systems|alexpate/awesome-design-systems|/README.md
'

clone_all() {
  echo "$REPOS" | while IFS='|' read -r name repo paths; do
    [ -z "$name" ] && continue
    target="$DEST/$name"
    [ -d "$target/.git" ] && continue
    rm -rf "$target"
    if git clone -q --depth 1 --filter=blob:none --no-checkout \
         "https://github.com/$repo.git" "$target" \
       && git -C "$target" sparse-checkout set --no-cone $paths \
       && git -C "$target" checkout -q; then
      echo "ok $repo"
    else
      echo "failed $repo"
      rm -rf "$target"
    fi
  done
  echo "done $(date -u +%FT%TZ)"
}

nohup bash -c "$(declare -f clone_all); REPOS='$REPOS' DEST='$DEST' clone_all" \
  >"$LOG" 2>&1 </dev/null &
exit 0
