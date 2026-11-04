#!/usr/bin/env bash
# Puts this checkout's JavaScript into an E2E app that's already built
# (.maestro/README.md): bundles with EXPO_PUBLIC_E2E=1 as the release build does
# (no dev, minified, Hermes bytecode) and replaces the bundle in the app. A
# JavaScript change then needs no native build, which is what CI does with the
# native build it keeps per fingerprint.
#
#   bash .maestro/scripts/embed-js.sh ios     .maestro/build/Revisely.app
#   bash .maestro/scripts/embed-js.sh android .maestro/build/revisely-e2e.apk
#
# Android re-signs the APK with the debug key prebuild generated, as the build did.
set -euo pipefail

PLATFORM=${1:?usage: embed-js.sh ios|android <app>}
TARGET=${2:?usage: embed-js.sh ios|android <app>}
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TARGET=$(cd "$(dirname "$TARGET")" && pwd)/$(basename "$TARGET")
cd "$ROOT"

export EXPO_PUBLIC_E2E=1
if [ "$PLATFORM" = android ]; then
  export EXPO_PUBLIC_E2E_HOST=${EXPO_PUBLIC_E2E_HOST:-10.0.2.2}
else
  export EXPO_PUBLIC_E2E_HOST=${EXPO_PUBLIC_E2E_HOST:-localhost}
fi
# Only what this script sets: not a developer's .env (EXPO_PUBLIC_* would be inlined).
export EXPO_NO_DOTENV=1 DOTENV_CONFIG_PATH=/dev/null

case "$(uname -s)" in
  Darwin) HERMESC=node_modules/react-native/sdks/hermesc/osx-bin/hermesc ;;
  *) HERMESC=node_modules/react-native/sdks/hermesc/linux64-bin/hermesc ;;
esac

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [ "$PLATFORM" = ios ]; then
  # --reset-cache: Metro's cache is shared between checkouts and doesn't key on
  # EXPO_PUBLIC_* values, so a cached release transform could come back here.
  npx expo export:embed --entry-file index.ts --platform ios --dev false --reset-cache \
    --bundle-output "$WORK/main.jsbundle" --assets-dest "$TARGET"
  "$HERMESC" -emit-binary -max-diagnostic-width=80 -O -out "$TARGET/main.jsbundle" "$WORK/main.jsbundle"
  echo "embedded the JavaScript in $TARGET"
elif [ "$PLATFORM" = android ]; then
  mkdir -p "$WORK/apk/assets" "$WORK/res"
  npx expo export:embed --entry-file index.ts --platform android --dev false --reset-cache \
    --bundle-output "$WORK/index.android.bundle.js" --assets-dest "$WORK/res"
  "$HERMESC" -emit-binary -max-diagnostic-width=80 -O -out "$WORK/apk/assets/index.android.bundle" "$WORK/index.android.bundle.js"
  cp "$TARGET" "$WORK/in.apk"
  # The bundle is stored uncompressed in a React Native APK; keep it so (-0).
  (cd "$WORK/apk" && zip -q -0 "$WORK/in.apk" assets/index.android.bundle)
  # Images the bundle names live in res/drawable-*: the ones from this bundle.
  if [ -n "$(ls -A "$WORK/res" 2>/dev/null)" ]; then
    (cd "$WORK" && mkdir -p apk-res && cp -R res apk-res/ && cd apk-res && zip -q -r "$WORK/in.apk" res)
  fi
  SDK=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}
  BUILD_TOOLS=$(ls -d "$SDK"/build-tools/* | sort -V | tail -1)
  "$BUILD_TOOLS/zipalign" -f -p 4 "$WORK/in.apk" "$WORK/aligned.apk"
  # The key the APK was built with: kept beside it by build-android.sh.
  KEYSTORE=${E2E_KEYSTORE:-$(dirname "$TARGET")/debug.keystore}
  [ -f "$KEYSTORE" ] || KEYSTORE=android/app/debug.keystore
  "$BUILD_TOOLS/apksigner" sign --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
    --ks-key-alias androiddebugkey --out "$TARGET" "$WORK/aligned.apk"
  echo "embedded the JavaScript in $TARGET"
else
  echo "usage: embed-js.sh ios|android <app>" >&2
  exit 2
fi
