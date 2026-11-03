#!/usr/bin/env bash
# Shows how much memory and CPU an app on the connected phone is using.
#   tasks/app-usage.sh                 the native Soccer app
#   tasks/app-usage.sh com.android.chrome
#   tasks/app-usage.sh --watch         CPU every 2 seconds until Ctrl-C
# The app has to be running. Memory is PSS, the app's fair share of RAM (a page
# shared with other processes counts in part), which is what Android's own
# memory screens show. CPU is percent of one core, so it can go over 100.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"

watch=0
pkg=com.jnyman.soccer
for arg in "$@"; do
  case "$arg" in
    --watch) watch=1 ;;
    *) pkg="$arg" ;;
  esac
done

pids=$(adb shell pidof "$pkg" | tr -d '\r' | tr ' ' ',')
if [ -z "$pids" ]; then
  echo "$pkg is not running on the phone." >&2
  exit 1
fi

echo "Memory (KB):"
adb shell dumpsys meminfo "$pkg" |
  sed -n '/App Summary/,/TOTAL SWAP/p' | grep -E 'Java Heap|Native Heap|Code|Stack|Graphics|Private Other|System|TOTAL'

echo
echo "CPU:"
if [ "$watch" = 1 ]; then
  adb shell top -d 2 -p "$pids" -o PID,%CPU,RES,ARGS
else
  adb shell top -b -n 1 -p "$pids" -o PID,%CPU,RES,ARGS | tail -n +5
fi
