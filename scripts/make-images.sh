#!/usr/bin/env bash
# Re-takes the two pictures this repo ships: public/card.png (the link preview)
# and public/favicon.png (the tab icon). Both are screenshots of /card.html and
# /icon.html, which draw a fixed arrangement with the site's own stylesheet and
# its own render.ts --- so changing how the game looks and re-running this is
# the whole update.
#
# agent-browser is a tool on the machine, not a dependency of the repo, so this
# runs by hand and CI only ever checks the result.
set -euo pipefail

port=4991
base="http://localhost:${port}/comp4020-crit5-amackay"

for tool in agent-browser jq; do
  command -v "$tool" > /dev/null || { echo "$tool is not installed" >&2; exit 1; }
done

cleanup() {
  agent-browser close > /dev/null 2>&1 || true
  pnpm exec astro preview stop > /dev/null 2>&1 || true
}
trap cleanup EXIT

pnpm build
# One preview daemon per project, so take a port of our own rather than share
# CI's 4989.
pnpm exec astro preview stop > /dev/null 2>&1 || true
pnpm exec astro preview --background --port "$port" > /dev/null

shoot() {
  local page="$1" width="$2" height="$3" out="$4"

  agent-browser set viewport "$width" "$height" > /dev/null
  agent-browser open "${base}/${page}" > /dev/null

  local verdict
  verdict=$(agent-browser eval "$(cat scripts/still-gate.js)")
  echo "$page: $verdict"
  if ! echo "$verdict" | jq -e '.ok' > /dev/null; then
    echo "nothing was shot --- the page did not draw what it should have:" >&2
    echo "$verdict" | jq -r '.problems[]? // "the gate returned nothing usable"' >&2
    exit 1
  fi

  # Into place only once it is a whole PNG: these are shipped files, and a
  # half-written one is worse than a stale one.
  local shot
  shot=$(mktemp -t still-XXXXXX.png)
  agent-browser screenshot "$shot" > /dev/null
  mv "$shot" "$out"
  echo "wrote $out (${width}x${height})"
}

shoot card.html 1200 630 public/card.png
shoot icon.html 256 256 public/favicon.png

node scripts/check-images.ts --write
# --write records and returns without validating, so check what was just
# recorded rather than assuming it.
node scripts/check-images.ts
