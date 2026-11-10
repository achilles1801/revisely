#!/usr/bin/env bash
# Installs the metrics collector on the owner's Mac (scripts/metrics/README.md):
# - copies the collector to ~/.local/share/revisely-metrics/bin, so it never depends on a checkout's branch;
# - writes ~/.config/revisely-metrics/config.json once (a fresh hash key; fill in the Drive file ids);
# - registers the launchd job app.revisely.metrics, which runs watch.js every minute.
#
#   bash scripts/metrics/install.sh             install or update (re-run after the scripts change)
#   bash scripts/metrics/install.sh --uninstall remove the job and the copied scripts (config and data stay)
set -euo pipefail

LABEL=app.revisely.metrics
HERE=$(cd "$(dirname "$0")" && pwd)
DATA="$HOME/.local/share/revisely-metrics"
BIN="$DATA/bin"
CONF_DIR="$HOME/.config/revisely-metrics"
CONF="$CONF_DIR/config.json"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/revisely-metrics.log"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  rm -rf "$BIN"
  echo "Removed the job and $BIN. Config ($CONF) and data ($DATA) are kept."
  exit 0
fi

NODE=$(command -v node || true)
GH=$(command -v gh || true)
[ -n "$NODE" ] || { echo "node not found"; exit 1; }
[ -n "$GH" ] || { echo "gh not found (it starts the totals workflow)"; exit 1; }

mkdir -p "$BIN" "$CONF_DIR" "$(dirname "$PLIST")" "$(dirname "$LOG")"
chmod 700 "$DATA" "$CONF_DIR"
for f in google firestore cloud metrics drive collect watch; do cp "$HERE/$f.js" "$BIN/$f.js"; done

if [ ! -f "$CONF" ]; then
  umask 077
  cat > "$CONF" <<EOF
{
  "keyFile": "~/secrets/revisely-metrics.json",
  "project": "revision-buddy-3a398",
  "hashKey": "$(openssl rand -hex 32)",
  "ownerUids": [],
  "drive": { "metricsFileId": "", "refreshFileId": "" },
  "repo": "achilles1801/revisely",
  "workflow": "metrics.yml"
}
EOF
  echo "Wrote $CONF: add the Drive file ids (and your uid in ownerUids to mark your own account)."
fi

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$BIN/watch.js</string></array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>$(dirname "$GH"):$(dirname "$NODE"):/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
  <key>ProcessType</key><string>Background</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installed $LABEL (every minute). Log: $LOG"
echo "Run once now: $NODE $BIN/watch.js --now"
