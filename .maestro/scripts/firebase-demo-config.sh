#!/usr/bin/env bash
# Writes the native Firebase config files for an E2E build: a demo project
# (demo-revisely), not the real one. The E2E app talks only to the emulators
# (src/lib/e2e/firebase.ts); the native SDK just needs a file that parses.
#
#   ios      ./GoogleService-Info.plist (the fixed path in app.config.js)
#   android  $GOOGLE_SERVICES_JSON, default $RUNNER_TEMP or the scratch dir
#
# It never overwrites a real file: an existing GoogleService-Info.plist that
# isn't this demo one stops it. No keys here are real, and none is shaped like
# one (the secret scan would rightly stop it).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
PROJECT=demo-revisely
BUNDLE=com.revisionbuddy.app
# Shaped like nothing the secret scan looks for; Firebase only stores it.
API_KEY=demo-e2e-not-a-key
SENDER=123456789012

write_ios() {
  local plist="$ROOT/GoogleService-Info.plist"
  if [ -f "$plist" ] && ! grep -q "<string>$PROJECT</string>" "$plist"; then
    echo "error: $plist exists and isn't the demo config; move it aside for an E2E build." >&2
    exit 1
  fi
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>API_KEY</key><string>$API_KEY</string>
  <key>GCM_SENDER_ID</key><string>$SENDER</string>
  <key>PLIST_VERSION</key><string>1</string>
  <key>BUNDLE_ID</key><string>$BUNDLE</string>
  <key>PROJECT_ID</key><string>$PROJECT</string>
  <key>STORAGE_BUCKET</key><string>$PROJECT.appspot.com</string>
  <key>IS_ADS_ENABLED</key><false/>
  <key>IS_ANALYTICS_ENABLED</key><false/>
  <key>IS_APPINVITE_ENABLED</key><false/>
  <key>IS_GCM_ENABLED</key><false/>
  <key>IS_SIGNIN_ENABLED</key><true/>
  <key>GOOGLE_APP_ID</key><string>1:$SENDER:ios:0000000000000000000000</string>
  <key>CLIENT_ID</key><string>$SENDER-e2e.apps.googleusercontent.com</string>
  <key>REVERSED_CLIENT_ID</key><string>com.googleusercontent.apps.$SENDER-e2e</string>
</dict>
</plist>
PLIST
  echo "wrote $plist (demo project $PROJECT)"
}

write_android() {
  local out="${GOOGLE_SERVICES_JSON:-${RUNNER_TEMP:-$ROOT/.maestro/build}/google-services.json}"
  mkdir -p "$(dirname "$out")"
  cat > "$out" <<JSON
{
  "project_info": {
    "project_number": "$SENDER",
    "project_id": "$PROJECT",
    "storage_bucket": "$PROJECT.appspot.com"
  },
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:$SENDER:android:0000000000000000000000",
        "android_client_info": { "package_name": "$BUNDLE" }
      },
      "oauth_client": [],
      "api_key": [{ "current_key": "$API_KEY" }],
      "services": { "appinvite_service": { "other_platform_oauth_client": [] } }
    }
  ],
  "configuration_version": "1"
}
JSON
  echo "wrote $out (demo project $PROJECT)"
}

case "${1:-}" in
  ios) write_ios ;;
  android) write_android ;;
  *) echo "usage: $0 ios|android" >&2; exit 2 ;;
esac
