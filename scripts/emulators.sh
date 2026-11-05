#!/usr/bin/env bash
# The Firebase emulators, one user at a time per set of ports.
#
#   scripts/emulators.sh exec  <only> <project> '<command>'   # emulators:exec, then stop
#   scripts/emulators.sh start <only> <project>               # emulators:start, until stopped
#
#   <only>     e.g. auth,firestore   or   firestore,storage
#   <command>  run from the folder you called this from, with FIRESTORE_EMULATOR_HOST,
#              FIREBASE_AUTH_EMULATOR_HOST and FIREBASE_STORAGE_EMULATOR_HOST set
#
# Several sessions or worktrees on one computer used to start emulators on the same
# ports (8080, 9099, 4400, ...) and fail, or worse, run against each other's data. Every
# script that starts emulators (the scenario and rules suites, local E2E, their CI jobs)
# comes through here, so:
#
# Ports: firebase.json's by default (Firestore 8080, Auth 9099, Storage 9199, hub 4400,
# logging 4500, Firestore websocket 9150). To run beside another worktree, give this one
# its own set:
#   REVISELY_EMU_PORT_BASE=auto   a base picked from this worktree's path (the same each time)
#   REVISELY_EMU_PORT_BASE=21000  Firestore 21000, Auth +1, Storage +2, hub +3, logging +4,
#                                 Firestore websocket +5
#   REVISELY_EMU_FIRESTORE_PORT / REVISELY_EMU_AUTH_PORT / REVISELY_EMU_STORAGE_PORT
#                                 one port each (hub and logging go beside Auth)
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
else
  FIRESTORE=${REVISELY_EMU_FIRESTORE_PORT:-8080}
  AUTH=${REVISELY_EMU_AUTH_PORT:-9099}
  STORAGE=${REVISELY_EMU_STORAGE_PORT:-9199}
  if [ "$FIRESTORE" = 8080 ] && [ "$AUTH" = 9099 ]; then
    HUB=4400 LOGGING=4500 WEBSOCKET=9150
  else
    HUB=$((AUTH + 1)) LOGGING=$((AUTH + 2)) WEBSOCKET=$((FIRESTORE + 1070))
  fi
fi
PORTS="$FIRESTORE $HUB $LOGGING $WEBSOCKET"
case ",$ONLY," in *,auth,*) PORTS="$PORTS $AUTH" ;; esac
case ",$ONLY," in *,storage,*) PORTS="$PORTS $STORAGE" ;; esac

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

# ---- config --------------------------------------------------------------
# firebase.json's rules files, these ports, in a folder of our own (the CLI also
# writes its debug logs where it runs).
WORK=$(mktemp -d)
CONFIG="$WORK/firebase.json"
ROOT="$ROOT" FIRESTORE="$FIRESTORE" AUTH="$AUTH" STORAGE="$STORAGE" HUB="$HUB" LOGGING="$LOGGING" WEBSOCKET="$WEBSOCKET" \
  node -e '
    const e = process.env;
    const n = (k) => Number(e[k]);
    const config = {
      firestore: { rules: `${e.ROOT}/firestore.rules`, indexes: `${e.ROOT}/firestore.indexes.json` },
      storage: { rules: `${e.ROOT}/storage.rules` },
      emulators: {
        auth: { host: "127.0.0.1", port: n("AUTH") },
        firestore: { host: "127.0.0.1", port: n("FIRESTORE"), websocketPort: n("WEBSOCKET") },
        storage: { host: "127.0.0.1", port: n("STORAGE") },
        hub: { host: "127.0.0.1", port: n("HUB") },
        logging: { host: "127.0.0.1", port: n("LOGGING") },
        ui: { enabled: false },
        singleProjectMode: true,
      },
    };
    require("fs").writeFileSync(process.argv[1], JSON.stringify(config, null, 2));
  ' "$CONFIG"
cp "$ROOT/.firebaserc" "$WORK/" 2>/dev/null || true
echo "emulators: $ONLY on firestore $FIRESTORE, auth $AUTH, storage $STORAGE (hub $HUB)" >&2

cd "$WORK"
if [ "$MODE" = exec ]; then
  firebase emulators:exec --config "$CONFIG" --only "$ONLY" --project "$PROJECT" \
    "cd $(printf '%q' "$CALLER") && $COMMAND" &
else
  firebase emulators:start --config "$CONFIG" --only "$ONLY" --project "$PROJECT" &
fi
CHILD=$!
set +e
wait "$CHILD"
status=$?
set -e
CHILD=""
exit "$status"
