#!/usr/bin/env bash
# Starts the Auth and Firestore emulators for the E2E flows (.maestro/README.md):
# project demo-revisely, the real firestore.rules. Runs until stopped.
#
#   bash .maestro/scripts/emulators.sh
#
# E2E_AUTH_PORT and E2E_FIRESTORE_PORT move them off firebase.json's ports
# (9099, 8080), for a computer where the scenario tests use those; build the app
# with the same EXPO_PUBLIC_E2E_AUTH_PORT and EXPO_PUBLIC_E2E_FIRESTORE_PORT.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
AUTH=${E2E_AUTH_PORT:-9099}
FIRESTORE=${E2E_FIRESTORE_PORT:-8080}
CONFIG="$ROOT/firebase.json"

if [ "$AUTH" != 9099 ] || [ "$FIRESTORE" != 8080 ]; then
  # firebase.json with other ports (and the hub, logging and websocket ports
  # beside them), in a folder of its own.
  DIR=$(mktemp -d)
  CONFIG="$DIR/firebase.json"
  ROOT="$ROOT" AUTH="$AUTH" FIRESTORE="$FIRESTORE" node -e '
    const { ROOT, AUTH, FIRESTORE } = process.env;
    const config = {
      firestore: { rules: `${ROOT}/firestore.rules`, indexes: `${ROOT}/firestore.indexes.json` },
      emulators: {
        auth: { host: "127.0.0.1", port: Number(AUTH) },
        firestore: { host: "127.0.0.1", port: Number(FIRESTORE), websocketPort: Number(FIRESTORE) + 1070 },
        hub: { host: "127.0.0.1", port: Number(AUTH) + 1 },
        logging: { host: "127.0.0.1", port: Number(AUTH) + 2 },
        ui: { enabled: false },
        singleProjectMode: true,
      },
    };
    require("fs").writeFileSync(process.argv[1], JSON.stringify(config, null, 2));
  ' "$CONFIG"
  echo "emulators on other ports: auth $AUTH, firestore $FIRESTORE ($CONFIG)"
fi

# From a scratch folder: the CLI writes its debug logs where it runs.
cd "$(mktemp -d)"
exec firebase emulators:start --only auth,firestore --project demo-revisely --config "$CONFIG"
