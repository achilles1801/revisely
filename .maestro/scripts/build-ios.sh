#!/usr/bin/env bash
# Builds the E2E app for the iOS Simulator (.maestro/README.md): a Release build,
# so no Metro and no dev menu, with the JavaScript bundled with EXPO_PUBLIC_E2E=1
# (the emulators, the test clock: src/lib/e2e). A local build for testing, never
# a release: it isn't signed, its Firebase config is the demo project's, and
# expo-updates is off so it can only ever run the JavaScript built into it.
#
#   bash .maestro/scripts/build-ios.sh            → .maestro/build/Revisely.app
#
# Then (or after any JavaScript change, without rebuilding):
#   bash .maestro/scripts/embed-js.sh ios .maestro/build/Revisely.app
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${E2E_BUILD_DIR:-$ROOT/.maestro/build}
cd "$ROOT"
mkdir -p "$OUT"

bash .maestro/scripts/firebase-demo-config.sh ios
# app.config.js lists it as a URL scheme; any value will do here.
export GOOGLE_REVERSED_CLIENT_ID=com.googleusercontent.apps.123456789012-e2e
export EXPO_PUBLIC_E2E=1
export EXPO_PUBLIC_E2E_HOST=${EXPO_PUBLIC_E2E_HOST:-localhost}
# Only what this script sets: not a developer's .env (app.config.js and Expo CLI
# would load it, and its EXPO_PUBLIC_* values would be inlined).
export EXPO_NO_DOTENV=1 DOTENV_CONFIG_PATH=/dev/null

# CocoaPods fails without a UTF-8 locale.
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8

# Prebuild over an existing ios/ fails in @bacons/apple-targets (CLAUDE.md, Widgets): --clean.
# Pods separately: prebuild only warns when pod install fails.
npx expo prebuild --platform ios --clean --no-install
(cd ios && pod install)

# No updates: an E2E build must never fetch and run published JavaScript.
EXPO_PLIST=$(find ios -name Expo.plist -path '*Supporting*' | head -1)
/usr/libexec/PlistBuddy -c 'Delete :EXUpdatesEnabled' "$EXPO_PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c 'Add :EXUpdatesEnabled bool false' "$EXPO_PLIST"
/usr/libexec/PlistBuddy -c 'Delete :EXUpdatesCheckOnLaunch' "$EXPO_PLIST" 2>/dev/null || true
/usr/libexec/PlistBuddy -c 'Add :EXUpdatesCheckOnLaunch string NEVER' "$EXPO_PLIST"

WORKSPACE=$(ls -d ios/*.xcworkspace | head -1)
SCHEME=$(basename "$WORKSPACE" .xcworkspace)

# CLAUDE.md (Widgets, local builds): newer Xcode refuses the pods' old deployment
# targets, and Sentry would try to upload symbols. Unsigned: the simulator runs it.
# One architecture (Apple silicon) halves the build.
echo "xcodebuild (log: $OUT/xcodebuild.log)"
if ! xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$OUT/ios-derived" \
  ONLY_ACTIVE_ARCH=YES ARCHS=arm64 \
  IPHONEOS_DEPLOYMENT_TARGET=16.0 \
  SENTRY_DISABLE_AUTO_UPLOAD=true \
  CODE_SIGNING_ALLOWED=NO \
  COMPILER_INDEX_STORE_ENABLE=NO \
  build > "$OUT/xcodebuild.log" 2>&1; then
  grep -E 'error:|\*\* BUILD FAILED' "$OUT/xcodebuild.log" | head -40 >&2
  tail -30 "$OUT/xcodebuild.log" >&2
  exit 1
fi

APP=$(find "$OUT/ios-derived/Build/Products/Release-iphonesimulator" -maxdepth 1 -name '*.app' | head -1)
rm -rf "$OUT/Revisely.app"
cp -R "$APP" "$OUT/Revisely.app"
echo "built $OUT/Revisely.app"
