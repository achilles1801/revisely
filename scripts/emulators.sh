#!/usr/bin/env bash
# The Firebase emulators, one user at a time per set of ports.
#
#   scripts/emulators.sh exec  <only> <project> '<command>'   # emulators:exec, then stop
#   scripts/emulators.sh start <only> <project>               # emulators:start, until stopped
#
#   <only>     e.g. auth,firestore   or   firestore,storage   or   auth,firestore,functions,storage
#   <command>  run from the folder you called this from, with FIRESTORE_EMULATOR_HOST,
#              FIREBASE_AUTH_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST set, and
#              REVISELY_FUNCTIONS_EMULATOR (host:port) when functions run
#
# functions: our Cloud Functions (functions/, built first), as deployed, except that inside the
# emulator with a demo- project the Anthropic call answers with a recorded real reply and the
# server's clock can follow the caller's test clock (functions/src/emulator.ts, TESTING.md).
#
# Several sessions or worktrees on one computer used to start emulators on the same
# ports (8080, 9099, 4400, ...) and fail, or worse, run against each other's data. Every
# script that starts emulators (the scenario and rules suites, local E2E, their CI jobs)
# comes through here, so:
#
# Ports: firebase.json's by default (Firestore 8080, Auth 9099, Storage 9199, Functions 5001,
# hub 4400, logging 4500, Firestore websocket 9150). To run beside another worktree, give this
# one its own set:
#   REVISELY_EMU_PORT_BASE=auto   a base picked from this worktree's path (the same each time)
#   REVISELY_EMU_PORT_BASE=21000  Firestore 21000, Auth +1, Storage +2, hub +3, logging +4,
#                                 Firestore websocket +5, Functions +6
#   REVISELY_EMU_FIRESTORE_PORT / REVISELY_EMU_AUTH_PORT / REVISELY_EMU_STORAGE_PORT /
#   REVISELY_EMU_FUNCTIONS_PORT   one port each (hub, logging and functions go beside Auth)
#
# Lock: one run per Firestore port, a folder in /tmp (REVISELY_EMU_LOCK_DIR) holding the
# owner's pid. A run waits for it (REVISELY_EMU_LOCK_WAIT seconds, default 1800), takes
# over a lock whose owner has exited, and also waits while the ports are taken by
# something that didn't come through here, saying what holds them.
set -euo pipefail

MODE=${1:-}
ONLY=${2:-}
PROJECT=${3:-}
COMMAND=${4:-}
if [ "$MODE" != exec ] && [ "$MODE" != start ] || [ -z "$ONLY" ] || [ -z "$PROJECT" ] ||
  { [ "$MODE" = exec ] && [ -z "$COMMAND" ]; }; then
  sed -n '2,6p' "$0" >&2
  exit 64
fi

ROOT=$(cd "$(dirname "$0")/.." && pwd)
# The Firebase CLI pinned in tests/scenarios (its emulators are the ones the suites
# are tested against; firebase-tools 15.15's Firestore emulator garbles Listen
# streams and broke SYNC-1/3, #275), when installed; otherwise the one on PATH.
FIREBASE="$ROOT/tests/scenarios/node_modules/.bin/firebase"
[ -x "$FIREBASE" ] || FIREBASE=firebase
CALLER=$(pwd)

# ---- ports ---------------------------------------------------------------
BASE=${REVISELY_EMU_PORT_BASE:-}
if [ "$BASE" = auto ]; then
  # 20000–29990, a step of 10 per worktree path.
  sum=$(printf '%s' "$ROOT" | cksum | cut -d' ' -f1)
  BASE=$((20000 + (sum % 1000) * 10))
fi
if [ -n "$BASE" ]; then
  FIRESTORE=$BASE AUTH=$((BASE + 1)) STORAGE=$((BASE + 2)) HUB=$((BASE + 3)) LOGGING=$((BASE + 4)) WEBSOCKET=$((BASE + 5))
  FUNCTIONS=$((BASE + 6))
else
  FIRESTORE=${REVISELY_EMU_FIRESTORE_PORT:-8080}
  AUTH=${REVISELY_EMU_AUTH_PORT:-9099}
  STORAGE=${REVISELY_EMU_STORAGE_PORT:-9199}
  if [ "$FIRESTORE" = 8080 ] && [ "$AUTH" = 9099 ]; then
    HUB=4400 LOGGING=4500 WEBSOCKET=9150 FUNCTIONS=${REVISELY_EMU_FUNCTIONS_PORT:-5001}
  else
    HUB=$((AUTH + 1)) LOGGING=$((AUTH + 2)) WEBSOCKET=$((FIRESTORE + 1070)) FUNCTIONS=${REVISELY_EMU_FUNCTIONS_PORT:-$((AUTH + 3))}
  fi
fi
PORTS="$FIRESTORE $HUB $LOGGING $WEBSOCKET"
case ",$ONLY," in *,auth,*) PORTS="$PORTS $AUTH" ;; esac
case ",$ONLY," in *,storage,*) PORTS="$PORTS $STORAGE" ;; esac
WITH_FUNCTIONS=false
case ",$ONLY," in *,functions,*) PORTS="$PORTS $FUNCTIONS"; WITH_FUNCTIONS=true ;; esac

# ---- lock ----------------------------------------------------------------
LOCK_DIR=${REVISELY_EMU_LOCK_DIR:-/tmp}
LOCK="${LOCK_DIR%/}/revisely-emulators-$FIRESTORE.lock"
WAIT=${REVISELY_EMU_LOCK_WAIT:-1800}
WHAT="$MODE $ONLY in $ROOT (pid $$)"

port_taken() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
taken_ports() {
  local p out=""
  for p in $PORTS; do port_taken "$p" && out="$out $p"; done
  printf '%s' "${out# }"
}

waited=0
say_every=60
until mkdir "$LOCK" 2>/dev/null; do
  holder=$(cat "$LOCK/pid" 2>/dev/null || true)
  if [ -n "$holder" ] && ! kill -0 "$holder" 2>/dev/null; then
    echo "emulators: the lock's owner (pid $holder) has exited; taking it over" >&2
    rm -rf "$LOCK"
    continue
  fi
  if [ -z "$holder" ] && [ -n "$(find "$LOCK" -maxdepth 0 -mmin +2 2>/dev/null)" ]; then
    echo "emulators: an empty lock older than 2 minutes; taking it over" >&2
    rm -rf "$LOCK"
    continue
  fi
  [ "$waited" -ge "$WAIT" ] && { echo "emulators: waited ${WAIT}s for $LOCK ($(cat "$LOCK/what" 2>/dev/null)); giving up" >&2; exit 75; }
  [ $((waited % say_every)) -eq 0 ] && echo "emulators: waiting for $(cat "$LOCK/what" 2>/dev/null || echo 'another run') to finish" >&2
  sleep 5
  waited=$((waited + 5))
done
echo $$ >"$LOCK/pid"
echo "$WHAT" >"$LOCK/what"
CHILD=""
release() {
  [ -n "$CHILD" ] && kill "$CHILD" 2>/dev/null || true
  rm -rf "$LOCK"
}
trap release EXIT
trap 'release; exit 130' INT TERM

# Ports held by something that didn't take the lock (an emulator started by hand).
until [ -z "$(taken_ports)" ]; do
  busy=$(taken_ports)
  [ "$waited" -ge "$WAIT" ] && { echo "emulators: ports $busy still in use after ${WAIT}s; giving up" >&2; exit 75; }
  if [ $((waited % say_every)) -eq 0 ]; then
    echo "emulators: ports $busy are in use outside this script:" >&2
    for p in $busy; do
      (command -v lsof >/dev/null && lsof -nP -iTCP:"$p" -sTCP:LISTEN 2>/dev/null | tail -n +2 | awk '{print "  " $1 " pid " $2}') >&2 || true
    done
  fi
  sleep 5
  waited=$((waited + 5))
done

# ---- functions -----------------------------------------------------------
# The emulator runs the built functions (functions/lib), so build them first; and their one
# secret needs a value in the emulator, which never reaches Anthropic with it (the recorded
# replies answer instead), so a placeholder is written if there is none.
if [ "$WITH_FUNCTIONS" = true ]; then
  if [ ! -d "$ROOT/functions/node_modules" ]; then
    echo "emulators: functions need their packages first: (cd functions && npm ci)" >&2
    exit 64
  fi
  echo "emulators: building functions/" >&2
  npm --prefix "$ROOT/functions" run --silent build >&2
  [ -f "$ROOT/functions/.secret.local" ] || echo 'ANTHROPIC_COACH_KEY=emulator-only-recorded-replies' >"$ROOT/functions/.secret.local"
  export REVISELY_FUNCTIONS_EMULATOR="127.0.0.1:$FUNCTIONS"
fi

# ---- config --------------------------------------------------------------
# firebase.json's rules files, these ports, in a folder of our own (the CLI also
# writes its debug logs where it runs).
WORK=$(mktemp -d)
CONFIG="$WORK/firebase.json"
ROOT="$ROOT" FIRESTORE="$FIRESTORE" AUTH="$AUTH" STORAGE="$STORAGE" HUB="$HUB" LOGGING="$LOGGING" WEBSOCKET="$WEBSOCKET" FUNCTIONS="$FUNCTIONS" \
  node -e '
    const e = process.env;
    const n = (k) => Number(e[k]);
    const config = {
      firestore: { rules: `${e.ROOT}/firestore.rules`, indexes: `${e.ROOT}/firestore.indexes.json` },
      storage: { rules: `${e.ROOT}/storage.rules` },
      // The CLI takes the source relative to the folder of the config.
      functions: [{ source: require("path").relative(require("path").dirname(process.argv[1]), `${e.ROOT}/functions`), codebase: "default", runtime: "nodejs22" }],
      emulators: {
        auth: { host: "127.0.0.1", port: n("AUTH") },
        firestore: { host: "127.0.0.1", port: n("FIRESTORE"), websocketPort: n("WEBSOCKET") },
        storage: { host: "127.0.0.1", port: n("STORAGE") },
        functions: { host: "127.0.0.1", port: n("FUNCTIONS") },
        hub: { host: "127.0.0.1", port: n("HUB") },
        logging: { host: "127.0.0.1", port: n("LOGGING") },
        ui: { enabled: false },
        singleProjectMode: true,
      },
    };
    require("fs").writeFileSync(process.argv[1], JSON.stringify(config, null, 2));
  ' "$CONFIG"
cp "$ROOT/.firebaserc" "$WORK/" 2>/dev/null || true
echo "emulators: $ONLY on firestore $FIRESTORE, auth $AUTH, storage $STORAGE, functions $FUNCTIONS (hub $HUB)" >&2

cd "$WORK"
if [ "$MODE" = exec ]; then
  "$FIREBASE" emulators:exec --config "$CONFIG" --only "$ONLY" --project "$PROJECT" \
    "cd $(printf '%q' "$CALLER") && $COMMAND" &
else
  "$FIREBASE" emulators:start --config "$CONFIG" --only "$ONLY" --project "$PROJECT" &
fi
CHILD=$!
set +e
wait "$CHILD"
status=$?
set -e
CHILD=""
exit "$status"
