#!/usr/bin/env bash
# Checks every page of the web app for WCAG AAA contrast in light and dark
# mode (e2e/contrast.spec.ts). Pass a directory to also save a grayscale
# screenshot of each page there, the way a phone with grayscale on shows it:
#   tasks/check-contrast.sh /tmp/shots
set -euo pipefail
cd "$(dirname "$0")/.."
if [ $# -gt 0 ]; then
  mkdir -p "$1"
  export SHOTS="$(cd "$1" && pwd)"
fi
npx playwright test e2e/contrast.spec.ts
