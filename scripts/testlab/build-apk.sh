#!/usr/bin/env bash
# Builds the Test Lab app (testlab.yml, TESTING.md "Real devices"): a release APK for real Android
# phones, against production (the EAS production environment's config and google-services.json),
# with this commit's JavaScript and EXPO_PUBLIC_TESTLAB=1, which only:
#   - uses App Check's debug provider with the token registered for Test Lab
#     (EXPO_PUBLIC_TESTLAB_APPCHECK_TOKEN): Play Integrity can't vouch for an app installed outside
#     Play;
#   - sends nothing to Sentry (lib/releaseInfo sentryReports): its crashes would count against
#     production's crash-free gate.
# It is signed with the debug key prebuild generates, never uploaded to a store, and expo-updates is
# off, so it runs only the JavaScript built into it.
#
#   eas env:exec production 'bash scripts/testlab/build-apk.sh' --non-interactive
#     (with GOOGLE_SERVICES_JSON set to the file's path, EXPO_PUBLIC_TESTLAB_APPCHECK_TOKEN set)
#     → $TESTLAB_BUILD_DIR/revisely-testlab.apk (default build/testlab)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${TESTLAB_BUILD_DIR:-$ROOT/build/testlab}
cd "$ROOT"
mkdir -p "$OUT"

: "${GOOGLE_SERVICES_JSON:?the production google-services.json, by path}"
: "${EXPO_PUBLIC_TESTLAB_APPCHECK_TOKEN:?the App Check debug token registered for Test Lab}"
[ -n "${FIREBASE_API_KEY:-}" ] || { echo "Run inside: eas env:exec production '…' (the app's config)" >&2; exit 64; }
if [ -n "${EXPO_PUBLIC_E2E:-}" ]; then echo "EXPO_PUBLIC_E2E is set: this is not the E2E build" >&2; exit 64; fi

export EXPO_PUBLIC_TESTLAB=1
export EXPO_NO_DOTENV=1 DOTENV_CONFIG_PATH=/dev/null
export SENTRY_DISABLE_AUTO_UPLOAD=true SENTRY_ALLOW_FAILURE=true

npx expo prebuild --platform android --clean --no-install

# No updates: only the JavaScript built in.
MANIFEST=android/app/src/main/AndroidManifest.xml
node -e '
  const fs = require("fs");
  const file = process.argv[1];
  let xml = fs.readFileSync(file, "utf8");
  xml = xml.replace(/(android:name="expo\.modules\.updates\.ENABLED"\s+android:value=")[^"]*"/, "$1false\"");
  if (!/expo\.modules\.updates\.ENABLED/.test(xml)) {
    xml = xml.replace("</application>", "  <meta-data android:name=\"expo.modules.updates.ENABLED\" android:value=\"false\"/>\n  </application>");
  }
  fs.writeFileSync(file, xml);
' "$MANIFEST"
grep -q 'expo.modules.updates.ENABLED" android:value="false"' "$MANIFEST"

echo "gradle assembleRelease (arm64-v8a; log: $OUT/gradle.log)"
if ! (cd android && ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a > "$OUT/gradle.log" 2>&1); then
  grep -E 'FAILURE|error:|What went wrong' -A5 "$OUT/gradle.log" | head -60 >&2
  tail -30 "$OUT/gradle.log" >&2
  exit 1
fi
cp android/app/build/outputs/apk/release/app-release.apk "$OUT/revisely-testlab.apk"
# The token is in the bundle (that is how the debug provider gets it); never anything else of E2E.
if unzip -p "$OUT/revisely-testlab.apk" assets/index.android.bundle | grep -a -q revisely-e2e-build; then
  echo "The Test Lab bundle holds E2E code" >&2
  exit 1
fi
echo "built $OUT/revisely-testlab.apk"
