#!/usr/bin/env bash
# Runs the native client's unit tests. tasks/test-native-server.sh also runs
# the tests that need a server.
set -euo pipefail
make -C "$(dirname "$0")/../native" test
