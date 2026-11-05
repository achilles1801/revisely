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
# The shared script takes the emulators' lock and writes the config for other ports
# (scripts/emulators.sh). E2E_*_PORT stay this script's names for them.
REVISELY_EMU_AUTH_PORT=${E2E_AUTH_PORT:-9099} \
REVISELY_EMU_FIRESTORE_PORT=${E2E_FIRESTORE_PORT:-8080} \
  exec "$ROOT/scripts/emulators.sh" start auth,firestore demo-revisely
