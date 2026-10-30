#!/usr/bin/env bash
# Builds the Android app into native/soccer.apk (see native/README.md).
# Needs tasks/android-setup.sh to have been run once.
set -euo pipefail
source "$(dirname "$0")/android-env.sh"
make -C "$(dirname "$0")/../native" android
