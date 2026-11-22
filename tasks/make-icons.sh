#!/usr/bin/env bash
# Renders the app's install and home-screen icons (src/web/images/icon-*.png,
# apple-touch-icon.png) from src/web/images/soccer.svg. Run again after
# changing the SVG.
set -euo pipefail
cd "$(dirname "$0")/.."
node tasks/make-icons.mjs
