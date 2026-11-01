#!/usr/bin/env bash
# Times how long the web app (installed from Chrome) and the native app take
# to start on the connected phone; see docs/startup-and-size.html.
#   tasks/measure-startup.sh [runs]     (default 3 runs of each)
# It force-stops Chrome between runs (your tabs come back) and takes a few
# minutes. SOCCER_HOST=... measures another site's installed web app.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
exec node "$(dirname "$0")/measure-startup.mjs" "$@"
