#!/usr/bin/env bash
# Throwaway ImageBase server for the E2E suite. Every run starts from an empty
# data dir (the server creates its schema on start), so tests never read or
# write real dev data. Builds ../ImageBase first (`make build`, which uses
# ../goose when that checkout exists).
set -euo pipefail

cd "$(dirname "$0")"
IMAGEBASE="$(cd "${IMAGEBASE:-../../ImageBase}" && pwd)"
DEPOT="$PWD/.depot"
PORT="${E2E_API_PORT:-4010}"

(cd "$IMAGEBASE" && source tasks/goose-env.sh && make build >/dev/null)

rm -rf "$DEPOT"
mkdir -p "$DEPOT"

# Published schedules are files in --pages-dir (nginx serves them in production).
exec "$IMAGEBASE/server/imagebase" --data "$DEPOT" --address "localhost:$PORT" --dev \
  --pages-dir "$DEPOT/pages"
