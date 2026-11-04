#!/usr/bin/env bash
# Runs the E2E flows (.maestro/README.md) on one booted device, one flow at a
# time, each in its own time zone:
#
#   bash .maestro/run.sh ios     [flow.yaml ...]   (default: every flow in .maestro/flows)
#   bash .maestro/run.sh android [flow.yaml ...]
#
# A flow names its zone in a header line, `# e2e-zone: Asia/Kathmandu`; without
# one it runs in America/Chicago (E2E_ZONE). iOS: the app is launched with TZ set
# (Maestro launches it with `xcrun simctl launch`, which passes SIMCTL_CHILD_*
# variables on). Android: the emulator's own zone is set before the flow.
#
# Environment:
#   E2E_DEVICE         simulator UDID / adb serial (default: the one booted device)
#   E2E_AUTH_URL       the Auth emulator as this computer sees it (http://127.0.0.1:9099)
#   E2E_FIRESTORE_URL  the Firestore emulator (http://127.0.0.1:8080)
#   E2E_OUTPUT         where reports, logs and screenshots go (.maestro/build/results)
#   E2E_RETRIES        reruns of a failed flow (default 0); a pass on a rerun is reported
#   E2E_ZONE           the zone for flows that name none (America/Chicago)
set -uo pipefail

PLATFORM=${1:?usage: run.sh ios|android [flow.yaml ...]}
shift
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLOWS=("$@")
if [ ${#FLOWS[@]} -eq 0 ]; then
  while IFS= read -r f; do FLOWS+=("$f"); done < <(ls "$ROOT"/.maestro/flows/*.yaml | sort)
fi
OUT=${E2E_OUTPUT:-$ROOT/.maestro/build/results}
RETRIES=${E2E_RETRIES:-0}
DEFAULT_ZONE=${E2E_ZONE:-America/Chicago}
AUTH_URL=${E2E_AUTH_URL:-http://127.0.0.1:9099}
FIRESTORE_URL=${E2E_FIRESTORE_URL:-http://127.0.0.1:8080}
MAESTRO=${MAESTRO:-$(command -v maestro || echo "$HOME/.maestro/bin/maestro")}
mkdir -p "$OUT"

DEVICE=${E2E_DEVICE:-}
if [ -z "$DEVICE" ]; then
  if [ "$PLATFORM" = ios ]; then
    DEVICE=$(xcrun simctl list devices booted -j | node -e '
      const d = Object.values(JSON.parse(require("fs").readFileSync(0)).devices).flat();
      if (d.length !== 1) { console.error(`${d.length} simulators booted: set E2E_DEVICE`); process.exit(1); }
      console.log(d[0].udid);') || exit 1
  else
    DEVICE=$(adb devices | awk 'NR > 1 && $2 == "device" { print $1 }' | head -1)
    [ -n "$DEVICE" ] || { echo "no Android device: set E2E_DEVICE" >&2; exit 1; }
  fi
fi

# `# e2e-ci-skip: ios — why` in a flow: not run on that platform in CI (CI set).
ci_skips() {
  [ -n "${CI:-}" ] && grep -Eq "^# e2e-ci-skip:.*\b$PLATFORM\b" "$1"
}

zone_of() {
  local z
  z=$(sed -n 's/^# e2e-zone: *\([^ ]*\).*/\1/p' "$1" | head -1)
  echo "${z:-$DEFAULT_ZONE}"
}

set_android_zone() {
  local zone=$1
  adb -s "$DEVICE" shell cmd alarm set-timezone "$zone" >/dev/null 2>&1 ||
    adb -s "$DEVICE" shell service call alarm 3 s16 "$zone" >/dev/null 2>&1 || true
  local now
  now=$(adb -s "$DEVICE" shell getprop persist.sys.timezone | tr -d '\r')
  if [ "$now" != "$zone" ]; then
    echo "error: the emulator's zone is '$now', not $zone" >&2
    return 1
  fi
}

# What the device saw, for a failed flow: a screenshot and the app's log.
save_device_state() {
  local out=$1
  if [ "$PLATFORM" = ios ]; then
    xcrun simctl io "$DEVICE" screenshot "$out/device.png" >/dev/null 2>&1 || true
    xcrun simctl spawn "$DEVICE" log show --last 5m --style compact \
      --predicate 'process == "Revisely"' > "$out/device.log" 2>&1 || true
  else
    adb -s "$DEVICE" exec-out screencap -p > "$out/device.png" 2>/dev/null || true
    adb -s "$DEVICE" logcat -d > "$out/logcat.txt" 2>&1 || true
  fi
}

run_flow() {
  local flow=$1 zone=$2 out=$3
  if [ "$PLATFORM" = android ]; then
    adb -s "$DEVICE" logcat -c >/dev/null 2>&1
    # A system dialog left up (a slow emulator's "isn't responding") would cover the app.
    adb -s "$DEVICE" shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1
  fi
  if [ "$PLATFORM" = ios ]; then
    SIMCTL_CHILD_TZ="$zone" "$MAESTRO" --device "$DEVICE" test \
      -e E2E_AUTH_URL="$AUTH_URL" -e E2E_FIRESTORE_URL="$FIRESTORE_URL" \
      --format junit --output "$out/report.xml" --debug-output "$out/debug" \
      "$flow" > "$out/maestro.log" 2>&1
  else
    set_android_zone "$zone" || return 1
    "$MAESTRO" --device "$DEVICE" test \
      -e E2E_AUTH_URL="$AUTH_URL" -e E2E_FIRESTORE_URL="$FIRESTORE_URL" \
      --format junit --output "$out/report.xml" --debug-output "$out/debug" \
      "$flow" > "$out/maestro.log" 2>&1
  fi
}

# The app's first launch, and iOS's one-time link prompt, before any flow.
echo "▶ warm-up ($PLATFORM)"
mkdir -p "$OUT/$PLATFORM"
"$MAESTRO" --device "$DEVICE" test "$ROOT/.maestro/subflows/warm-up.yaml" > "$OUT/$PLATFORM/warm-up.log" 2>&1 ||
  echo "  warm-up failed (see $OUT/$PLATFORM/warm-up.log); going on"

failed=0
summary="| Flow | Zone | Result | Time |\n| --- | --- | --- | --- |\n"
for flow in "${FLOWS[@]}"; do
  name=$(basename "$flow" .yaml)
  zone=$(zone_of "$flow")
  if ci_skips "$flow"; then
    echo "▷ $name skipped in CI on $PLATFORM: $(sed -n 's/^# e2e-ci-skip: *//p' "$flow" | head -1)"
    summary+="| $name | $zone | skipped in CI | |\n"
    continue
  fi
  result=failed
  start=$(date +%s)
  for attempt in $(seq 0 "$RETRIES"); do
    out="$OUT/$PLATFORM/$name"
    [ "$attempt" -gt 0 ] && out="$out-retry$attempt"
    rm -rf "$out" && mkdir -p "$out"
    if [ "$attempt" -gt 0 ]; then echo "▶ $name ($PLATFORM, $zone), retry $attempt"; else echo "▶ $name ($PLATFORM, $zone)"; fi
    if run_flow "$flow" "$zone" "$out"; then
      result=$([ "$attempt" -eq 0 ] && echo passed || echo "passed on retry $attempt")
      break
    fi
    save_device_state "$out"
    tail -25 "$out/maestro.log" | sed 's/^/    /'
  done
  secs=$(( $(date +%s) - start ))
  time=$(printf '%d:%02d' $((secs / 60)) $((secs % 60)))
  echo "  $result in $time"
  [ "$result" = failed ] && failed=$((failed + 1))
  if [ "$result" != passed ] && [ -n "${GITHUB_ACTIONS:-}" ]; then
    level=$([ "$result" = failed ] && echo error || echo warning)
    echo "::$level title=E2E $PLATFORM::$name $result ($zone)"
  fi
  summary+="| $name | $zone | $result | $time |\n"
done

printf "\n$summary"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf "### E2E flows (%s)\n\n$summary\n" "$PLATFORM" >> "$GITHUB_STEP_SUMMARY"
fi
[ "$failed" -eq 0 ]
