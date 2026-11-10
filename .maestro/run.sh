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
#   E2E_FUNCTIONS_URL  the functions emulator (http://127.0.0.1:5001)
#   E2E_PROJECT        the emulators' project (demo-revisely), whose data each attempt starts without
#   E2E_SHUFFLE        a seed: the flows run in that seed's order (scripts/shuffle.js; the nightly run)
#   E2E_OUTPUT         where reports, logs and screenshots go (.maestro/build/results)
#   E2E_RETRIES        reruns of a failed flow (default 0); a pass on a rerun is reported
#   E2E_REPEAT         runs of each flow, every one of which must pass, with no reruns (default 1;
#                      2 for a PR that changes shared test code: plan in ci.yml)
#   E2E_ZONE           the zone for flows that name none (America/Chicago)
#   E2E_FLOW_LIMIT     seconds an attempt may take before it is stopped (iOS 1200, Android 900)
#   E2E_WARMUP_LIMIT   seconds the warm-up may take (360)
set -uo pipefail

PLATFORM=${1:?usage: run.sh ios|android [flow.yaml ...]}
shift
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FLOWS=("$@")
if [ ${#FLOWS[@]} -eq 0 ]; then
  while IFS= read -r f; do FLOWS+=("$f"); done < <(ls "$ROOT"/.maestro/flows/*.yaml | sort)
fi
# E2E_SHUFFLE: the flows in the seed's order, the same each time for one seed. The nightly run's check
# that no flow leans on another having run before it on the same device (06's prayer line came from
# 04's location, and 11's from 06's: #217's runs 42662790506 and 42687083053).
if [ -n "${E2E_SHUFFLE:-}" ]; then
  shuffled=()
  while IFS= read -r f; do shuffled+=("$f"); done < <(node "$ROOT/.maestro/scripts/shuffle.js" "$E2E_SHUFFLE" "${FLOWS[@]}")
  FLOWS=("${shuffled[@]}")
  echo "Flows in the order of seed $E2E_SHUFFLE (E2E_SHUFFLE=$E2E_SHUFFLE runs it again):"
  for f in "${FLOWS[@]}"; do echo "  $(basename "$f" .yaml)"; done
fi
OUT=${E2E_OUTPUT:-$ROOT/.maestro/build/results}
RETRIES=${E2E_RETRIES:-0}
REPEAT=${E2E_REPEAT:-1}
# Repeated runs are the proof that a change to shared test code is sound: none may lean on a rerun.
[ "$REPEAT" -gt 1 ] && RETRIES=0
DEFAULT_ZONE=${E2E_ZONE:-America/Chicago}
AUTH_URL=${E2E_AUTH_URL:-http://127.0.0.1:9099}
FIRESTORE_URL=${E2E_FIRESTORE_URL:-http://127.0.0.1:8080}
FUNCTIONS_URL=${E2E_FUNCTIONS_URL:-http://127.0.0.1:5001}
PROJECT=${E2E_PROJECT:-demo-revisely}
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

# Runs "$@" for at most $1 seconds, then stops it (and its children). Maestro
# can hang for good: once its iOS driver answered 500, the CLI printed
# 'Exception in thread "main"' and its JVM never exited, holding a CI job for
# 55 minutes (Nov 5). A stopped run counts as a failed attempt.
with_limit() {
  local secs=$1 pid watcher status
  shift
  "$@" &
  pid=$!
  (
    sleep "$secs"
    if kill -0 "$pid" 2>/dev/null; then
      echo "  stopped after ${secs}s: $*" >&2
      pkill -TERM -P "$pid" 2>/dev/null; kill -TERM "$pid" 2>/dev/null
      sleep 10
      pkill -KILL -P "$pid" 2>/dev/null; kill -KILL "$pid" 2>/dev/null
    fi
  ) &
  watcher=$!
  wait "$pid"
  status=$?
  kill "$watcher" 2>/dev/null
  wait "$watcher" 2>/dev/null
  return "$status"
}

# A flow's attempt and the warm-up. They catch a hang (Maestro once waited 55 minutes), not a slow
# flow: on Android flows take 2–10 minutes, on iOS up to 15 (11-surah-names took 13:29 and once ran
# past 15:00, #328's run 42498597405; 09-revo 15:01), so iOS gets 20.
if [ "$PLATFORM" = ios ]; then FLOW_LIMIT=${E2E_FLOW_LIMIT:-1200}; else FLOW_LIMIT=${E2E_FLOW_LIMIT:-900}; fi
WARMUP_LIMIT=${E2E_WARMUP_LIMIT:-360}

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

# A flow's own screenshots of key screens (takeScreenshot: a name) go to
# $out/run/takeScreenshot/<name>.png; the workflow keeps them from every run.

# What the device saw, for a failed flow: a screenshot and the app's logs.
# app.log is the E2E build's own log (src/lib/e2e/log.ts): everything the app's
# JavaScript said, which an iOS release build doesn't pass to the system log
# (only console.error reaches it). Android's logcat has it (ReactNativeJS).
save_device_state() {
  local out=$1
  if [ "$PLATFORM" = ios ]; then
    xcrun simctl io "$DEVICE" screenshot "$out/device.png" >/dev/null 2>&1 || true
    xcrun simctl spawn "$DEVICE" log show --last 5m --style compact \
      --predicate 'process == "Revisely"' > "$out/device.log" 2>&1 || true
    local data
    data=$(xcrun simctl get_app_container "$DEVICE" com.revisionbuddy.app data 2>/dev/null) &&
      cp "$data/Documents/e2e-log.txt" "$out/app.log" 2>/dev/null || true
  else
    adb -s "$DEVICE" exec-out screencap -p > "$out/device.png" 2>/dev/null || true
    adb -s "$DEVICE" logcat -d > "$out/logcat.txt" 2>&1 || true
  fi
}

# iOS: Maestro's driver (an XCTest runner on the simulator) is installed by the warm-up and kept
# running from flow to flow. By default every `maestro test` uninstalls it, installs it again with
# xcodebuild and waits for it: much of the 35–160 s an iOS flow spent before its first step (#328's
# run 42746203992), and once the simulator refused to launch the fresh install ("Unknown
# application display identifier dev.mobile.maestro-driver-iosUITests.xctrunner") and the flow
# failed before it began (09-revo-attach). With --no-reinstall-driver Maestro uses the running
# driver, and installs it only when it isn't running (Maestro 2.11, LocalXCTestInstaller). After a
# failed attempt the next one installs it afresh, in case the driver was the trouble.
# The app is still launched per flow with `xcrun simctl launch`, so each flow's zone still applies.
# Android installs its driver only when it is missing, and keeps the default.
DRIVER=fresh

# Every attempt starts from empty emulators: no account, document or sign-in that an earlier flow (or
# attempt) left. A flow makes what it reads: its account, and config/app or a seed where it needs one.
# After three seeded accounts, 10-delete-account's deletion took 30.0 and 32.2 s on iOS against 3.4 and
# 4.0 s on an empty emulator, past the app's 30 s (#217's run 42687083053). Storage keeps its files:
# they are under each account's own id, and nothing lists another's.
clear_backend() {
  curl -fsS -X DELETE "$FIRESTORE_URL/emulator/v1/projects/$PROJECT/databases/(default)/documents" >/dev/null &&
    curl -fsS -X DELETE "$AUTH_URL/emulator/v1/projects/$PROJECT/accounts" >/dev/null
}

run_flow() {
  local flow=$1 zone=$2 out=$3 reuse=""
  [ "$DRIVER" = reuse ] && reuse=--no-reinstall-driver
  if ! clear_backend; then
    echo "    couldn't empty the emulators ($FIRESTORE_URL, $AUTH_URL) before $(basename "$flow" .yaml)" | tee "$out/maestro.log"
    return 1
  fi
  if [ "$PLATFORM" = ios ]; then
    # No position on the Simulator: a flow that wants one sets it (subflows/location.yaml), and the
    # app is denied location otherwise. The emulator's position can't be cleared; its permission is.
    xcrun simctl location "$DEVICE" clear >/dev/null 2>&1 ||
      echo "    couldn't clear the Simulator's location (the app is still denied it)"
  fi
  if [ "$PLATFORM" = android ]; then
    adb -s "$DEVICE" logcat -c >/dev/null 2>&1
    # A system dialog left up (a slow emulator's "isn't responding") would cover the app.
    adb -s "$DEVICE" shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1
    # Every attempt starts online. Airplane mode is the emulator's, not the app's: an attempt of
    # 06-offline that failed while offline left it on, and its retry and every later flow in the
    # job then failed at sign-up (develop, Nov 7 2026: 06 and 07 together). iOS needs nothing:
    # its offline switch is the app's own, and each flow starts from a fresh install.
    adb -s "$DEVICE" shell cmd connectivity airplane-mode disable >/dev/null 2>&1 || true
  fi
  if [ "$PLATFORM" = ios ]; then
    # $reuse unquoted: nothing at all when the driver is installed afresh.
    # shellcheck disable=SC2086
    with_limit "$FLOW_LIMIT" env SIMCTL_CHILD_TZ="$zone" "$MAESTRO" --device "$DEVICE" test $reuse \
      -e E2E_AUTH_URL="$AUTH_URL" -e E2E_FIRESTORE_URL="$FIRESTORE_URL" -e E2E_FUNCTIONS_URL="$FUNCTIONS_URL" \
      --format junit --output "$out/report.xml" --debug-output "$out/debug" \
      --test-output-dir "$out/run" \
      "$flow" > "$out/maestro.log" 2>&1
  else
    set_android_zone "$zone" || return 1
    with_limit "$FLOW_LIMIT" "$MAESTRO" --device "$DEVICE" test \
      -e E2E_AUTH_URL="$AUTH_URL" -e E2E_FIRESTORE_URL="$FIRESTORE_URL" -e E2E_FUNCTIONS_URL="$FUNCTIONS_URL" \
      --format junit --output "$out/report.xml" --debug-output "$out/debug" \
      --test-output-dir "$out/run" \
      "$flow" > "$out/maestro.log" 2>&1
  fi
}

# The app's first launch, and iOS's one-time link prompt, before any flow.
echo "▶ warm-up ($PLATFORM)"
mkdir -p "$OUT/$PLATFORM"
# It installs Maestro's driver afresh; the flows then use it (DRIVER above).
if with_limit "$WARMUP_LIMIT" "$MAESTRO" --device "$DEVICE" test "$ROOT/.maestro/subflows/warm-up.yaml" > "$OUT/$PLATFORM/warm-up.log" 2>&1; then
  DRIVER=reuse
else
  echo "  warm-up failed (see $OUT/$PLATFORM/warm-up.log); going on"
fi

failed=0
summary="| Flow | Zone | Result | Time |\n| --- | --- | --- | --- |\n"
# Every attempt, one line each (flow, zone, attempt, passed|failed, seconds, its folder):
# scripts/attempts.js turns them and Maestro's reports into attempts.json, which the
# workflow keeps for the weekly flake report (scripts/e2e/flakes.js).
ATTEMPTS="$OUT/$PLATFORM/attempts.tsv"
: > "$ATTEMPTS"
for flow in "${FLOWS[@]}"; do
  base=$(basename "$flow" .yaml)
  zone=$(zone_of "$flow")
  if ci_skips "$flow"; then
    echo "▷ $base skipped in CI on $PLATFORM: $(sed -n 's/^# e2e-ci-skip: *//p' "$flow" | head -1)"
    summary+="| $base | $zone | skipped in CI | |\n"
    continue
  fi
  for rep in $(seq 1 "$REPEAT"); do
  # Each repeated run is its own entry (results folder, attempts, summary).
  name=$base
  [ "$REPEAT" -gt 1 ] && name="$base-run$rep"
  result=failed
  start=$(date +%s)
  for attempt in $(seq 0 "$RETRIES"); do
    out="$OUT/$PLATFORM/$name"
    [ "$attempt" -gt 0 ] && out="$out-retry$attempt"
    rm -rf "$out" && mkdir -p "$out"
    if [ "$attempt" -gt 0 ]; then echo "▶ $name ($PLATFORM, $zone), retry $attempt"; else echo "▶ $name ($PLATFORM, $zone)"; fi
    tried=$(date +%s)
    if run_flow "$flow" "$zone" "$out"; then
      DRIVER=reuse
      printf '%s\t%s\t%s\tpassed\t%s\t%s\n' "$name" "$zone" "$attempt" $(( $(date +%s) - tried )) "$(basename "$out")" >> "$ATTEMPTS"
      result=$([ "$attempt" -eq 0 ] && echo passed || echo "passed on retry $attempt")
      break
    fi
    printf '%s\t%s\t%s\tfailed\t%s\t%s\n' "$name" "$zone" "$attempt" $(( $(date +%s) - tried )) "$(basename "$out")" >> "$ATTEMPTS"
    save_device_state "$out"
    DRIVER=fresh
    # The workflow keeps the results of a job with a failed attempt (a pass on a retry too).
    touch "$out/attempt-failed"
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
done

printf "\n$summary"
node "$ROOT/.maestro/scripts/attempts.js" "$OUT/$PLATFORM" ||
  echo "  couldn't write $OUT/$PLATFORM/attempts.json"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  printf "### E2E flows (%s)\n\n$summary\n" "$PLATFORM" >> "$GITHUB_STEP_SUMMARY"
fi
[ "$failed" -eq 0 ]
