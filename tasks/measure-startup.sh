#!/usr/bin/env bash
# Times how long the web app and the native app take to start on the
# connected phone; see docs/startup-and-size.html.
#   tasks/measure-startup.sh [runs]     (default 3 runs of each)
# Each installed copy of the web app (one per browser it was installed from:
# Chrome, Chrome Beta, ...) is timed in that browser. It force-stops the
# browsers between runs (your tabs come back) and takes a few minutes.
# SOCCER_HOST=... measures another site's installed web app.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
exec node "$(dirname "$0")/measure-startup.mjs" "$@"
