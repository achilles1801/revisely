#!/usr/bin/env bash
# Waits for the JavaScript bundle e2e.yml started in the background (embed-js.sh, while the
# emulator installs and boots) and fails with its log if it failed. Nothing to wait for when no
# bundle was started (a native build bundles the JavaScript itself).
#   bash .maestro/scripts/await-bundle.sh
set -uo pipefail
STATUS="${RUNNER_TEMP:-/tmp}/embed-js.status"
LOG="${RUNNER_TEMP:-/tmp}/embed-js.log"
[ -f "$LOG" ] || { echo "No background bundle: the build has its JavaScript."; exit 0; }
for _ in $(seq 1 360); do
  [ -s "$STATUS" ] && break
  sleep 1
done
if [ ! -s "$STATUS" ]; then
  echo "::error::The JavaScript bundle didn't finish in 6 minutes."
  tail -40 "$LOG"
  exit 1
fi
code=$(cat "$STATUS")
tail -5 "$LOG"
if [ "$code" != 0 ]; then
  echo "::error::Bundling this commit's JavaScript failed ($code)."
  tail -60 "$LOG"
  exit 1
fi
echo "Bundled this commit's JavaScript."
