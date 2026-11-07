#!/usr/bin/env bash
# Starts the emulators for the E2E flows (.maestro/README.md): project demo-revisely,
# Auth and Firestore with the real firestore.rules, Storage, and our Cloud Functions
# (built from functions/, which needs its packages: cd functions && npm ci), where
# only Anthropic answers from a recording (functions/src/emulator.ts). Runs until
# stopped.
#
#   bash .maestro/scripts/emulators.sh
#
# E2E_AUTH_PORT, E2E_FIRESTORE_PORT, E2E_FUNCTIONS_PORT and E2E_STORAGE_PORT move them
# off firebase.json's ports (9099, 8080, 5001, 9199), for a computer where the
# scenario tests use those; build the app with the same EXPO_PUBLIC_E2E_AUTH_PORT,
# EXPO_PUBLIC_E2E_FIRESTORE_PORT and EXPO_PUBLIC_E2E_FUNCTIONS_PORT.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
# The shared script takes the emulators' lock and writes the config for other ports
# (scripts/emulators.sh). E2E_*_PORT stay this script's names for them.
REVISELY_EMU_AUTH_PORT=${E2E_AUTH_PORT:-9099} \
REVISELY_EMU_FIRESTORE_PORT=${E2E_FIRESTORE_PORT:-8080} \
REVISELY_EMU_FUNCTIONS_PORT=${E2E_FUNCTIONS_PORT:-5001} \
REVISELY_EMU_STORAGE_PORT=${E2E_STORAGE_PORT:-9199} \
  exec "$ROOT/scripts/emulators.sh" start auth,firestore,functions,storage demo-revisely
