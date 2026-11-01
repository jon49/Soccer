#!/usr/bin/env bash
# Times the web app on the connected phone: taps during a match, and moving
# from page to page (see e2e/phone/speed.perf.ts and
# docs/startup-and-size.html). Drives the phone's Chrome, in new tabs it
# closes at the end. The match runs on test data in a localhost site of its
# own (wiped afterwards); the real site's pages are only read
# (SOCCER_SITE=https://... for another, SOCCER_SITE= to skip). ROUNDS=5 by
# default. Unlock the phone first; it takes a few minutes.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
cd "$(dirname "$0")/.."
adb forward tcp:9223 localabstract:chrome_devtools_remote >/dev/null
adb reverse tcp:8012 tcp:8012 >/dev/null
# Chrome must be in front with the screen on: a background tab draws no
# frames, and Playwright waits for frames before each click.
stay_on=$(adb shell settings get global stay_on_while_plugged_in | tr -d '\r')
# Playwright starts the dev server in a process group of its own, so it is
# stopped by name.
trap 'pkill -f -- "--env=dev -p 8012" || true; adb forward --remove tcp:9223; adb reverse --remove tcp:8012; adb shell settings put global stay_on_while_plugged_in "$stay_on"' EXIT
adb shell settings put global stay_on_while_plugged_in 7
adb shell input keyevent KEYCODE_WAKEUP
adb shell am start -n com.android.chrome/com.google.android.apps.chrome.Main >/dev/null
sleep 3
# In the background and in a process group of its own (with the dev server
# it starts), so that stopping this script stops all of it and still
# restores the phone (above).
setsid npx playwright test -c e2e/phone/playwright.config.ts "$@" &
pw=$!
trap 'kill -- -"$pw" 2>/dev/null; exit 130' INT TERM
wait "$pw"
