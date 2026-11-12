#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

npx --yes @zeropress/build "$SCRIPT_DIR/theme" \
  --data "$SCRIPT_DIR/zeropress-preview-data.json" \
  --out "$SCRIPT_DIR/dist" \
  --empty-out-dir
