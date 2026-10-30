#!/usr/bin/env bash
# Runs the native client's tests, including core/server_test.v, against a
# throwaway TrailBase on :4011 (e2e/backend.sh: needs trail and ../ImageBase).
# The server stops when the tests finish.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
port=4011

E2E_API_PORT=$port "$root/e2e/backend.sh" >/dev/null 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT

for _ in $(seq 1 120); do
  if (exec 3<>"/dev/tcp/localhost/$port") 2>/dev/null; then
    break
  fi
  if ! kill -0 $server 2>/dev/null; then
    echo "The test server didn't start; run E2E_API_PORT=$port e2e/backend.sh to see why." >&2
    exit 1
  fi
  sleep 1
done

SOCCER_TEST_SERVER=http://localhost:$port \
  SOCCER_TEST_DB="$root/e2e/.depot/data/main.db" \
  make -C "$root/native" test
