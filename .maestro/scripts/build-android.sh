#!/usr/bin/env bash
# Builds the E2E app for the Android emulator (.maestro/README.md): a release
# APK (no Metro, no dev menu) with the JavaScript bundled with EXPO_PUBLIC_E2E=1
# (the emulators at 10.0.2.2, the test clock: src/lib/e2e). A local build for
# testing, never a release: it is signed with the debug key prebuild generates,
# its Firebase config is the demo project's, cleartext HTTP is allowed (the
# emulators speak plain HTTP), and expo-updates is off so it can only ever run
# the JavaScript built into it.
#
#   bash .maestro/scripts/build-android.sh     → .maestro/build/revisely-e2e.apk
#
# E2E_ABI: the emulator's ABI (default: x86_64 on Intel/Linux, arm64-v8a on Apple silicon).
# Then (or after any JavaScript change, without rebuilding):
#   bash .maestro/scripts/embed-js.sh android .maestro/build/revisely-e2e.apk
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${E2E_BUILD_DIR:-$ROOT/.maestro/build}
cd "$ROOT"
mkdir -p "$OUT"

if [ -z "${E2E_ABI:-}" ]; then
  case "$(uname -m)" in
    arm64 | aarch64) E2E_ABI=arm64-v8a ;;
    *) E2E_ABI=x86_64 ;;
  esac
fi

if [ -z "${ANDROID_HOME:-}" ] && [ -d "$HOME/Library/Android/sdk" ]; then
  export ANDROID_HOME="$HOME/Library/Android/sdk"
fi

export GOOGLE_SERVICES_JSON="$OUT/google-services.json"
bash .maestro/scripts/firebase-demo-config.sh android
export EXPO_PUBLIC_E2E=1
export EXPO_PUBLIC_E2E_HOST=${EXPO_PUBLIC_E2E_HOST:-10.0.2.2}
# Only what this script sets: not a developer's .env (app.config.js and Expo CLI
# would load it, and its EXPO_PUBLIC_* values would be inlined).
export EXPO_NO_DOTENV=1 DOTENV_CONFIG_PATH=/dev/null
# No Sentry uploads (and no token here to make them).
export SENTRY_DISABLE_AUTO_UPLOAD=true SENTRY_ALLOW_FAILURE=true

npx expo prebuild --platform android --clean --no-install

# The generated project only (android/ is gitignored and rebuilt by prebuild):
# plain HTTP to the emulators, and no updates.
MANIFEST=android/app/src/main/AndroidManifest.xml
node -e '
  const fs = require("fs");
  const file = process.argv[1];
  let xml = fs.readFileSync(file, "utf8");
  if (!/usesCleartextTraffic=/.test(xml)) xml = xml.replace("<application ", "<application android:usesCleartextTraffic=\"true\" ");
  else xml = xml.replace(/usesCleartextTraffic="[^"]*"/, "usesCleartextTraffic=\"true\"");
  xml = xml.replace(/(android:name="expo\.modules\.updates\.ENABLED"\s+android:value=")[^"]*"/, "$1false\"");
  if (!/expo\.modules\.updates\.ENABLED/.test(xml)) {
    xml = xml.replace("</application>", "  <meta-data android:name=\"expo.modules.updates.ENABLED\" android:value=\"false\"/>\n  </application>");
  }
  fs.writeFileSync(file, xml);
' "$MANIFEST"
grep -q 'usesCleartextTraffic="true"' "$MANIFEST"
grep -q 'expo.modules.updates.ENABLED" android:value="false"' "$MANIFEST"

echo "gradle assembleRelease ($E2E_ABI; log: $OUT/gradle.log)"
if ! (cd android && ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures="$E2E_ABI" > "$OUT/gradle.log" 2>&1); then
  grep -E 'FAILURE|error:|What went wrong' -A5 "$OUT/gradle.log" | head -60 >&2
  tail -30 "$OUT/gradle.log" >&2
  exit 1
fi

cp android/app/build/outputs/apk/release/app-release.apk "$OUT/revisely-e2e.apk"
# embed-js.sh re-signs with the same key.
cp android/app/debug.keystore "$OUT/debug.keystore"
echo "built $OUT/revisely-e2e.apk"
