#!/bin/bash
# Places the store set's demo recording on a simulator or an emulator, as the 1.0.2 set did (CLAUDE.md, App Store →
# Screenshots): an .m4a in the app's recordings folder and an index.json entry whose levels are drawn to look like
# recitation. The simulator's microphone hears only silence, so a live recording would show a flat line. The account's
# recording backup is off (seed-screenshots.js), so it never uploads. Run with the app closed; it replaces the index.
#
#   scripts/store/place-demo-recording.sh ios <simulator udid> <uid> <audio.m4a> <levels.json>
#   scripts/store/place-demo-recording.sh android <adb serial> <uid> <audio.m4a> <levels.json>
#
# The recording: today (America/Chicago) from 5:25 AM, 41 minutes, Al-Mulk pp. 562–563 (the seed's dawn sitting).
set -euo pipefail
target=$1 device=$2 uid=$3 audio=$4 levels=$5
tmp=$(mktemp -d)
day=$(TZ=America/Chicago date +%Y-%m-%d)
created=$(( $(TZ=America/Chicago date -j -f "%Y-%m-%d %H:%M:%S" "$day 05:25:00" +%s) * 1000 ))
id="${created}-store1"
file="${id}-0.m4a"
duration=2460000
python3 - "$tmp/index.json" "$id" "$file" "$day" "$created" "$duration" "$levels" <<'PY'
import json, sys
out, rid, fname, day, created, duration, levels = sys.argv[1:]
entry = {
    'id': rid, 'kind': 'reading', 'day': day, 'createdAt': int(created), 'durationMs': int(duration),
    'segments': [{'fileName': fname, 'durationMs': int(duration), 'levels': json.load(open(levels))}],
    'pageMarks': [{'atMs': 0, 'page': 562}, {'atMs': 1230000, 'page': 563}],
    'storage': 'device',
}
json.dump([entry], open(out, 'w'))
PY
cp "$audio" "$tmp/$file"
if [ "$target" = ios ]; then
  xcrun simctl terminate "$device" com.revisionbuddy.app 2>/dev/null || true
  dir="$(xcrun simctl get_app_container "$device" com.revisionbuddy.app data)/Documents/recordings/$uid"
  mkdir -p "$dir"
  find "$dir" -maxdepth 1 -name '*.m4a' -delete
  cp "$tmp/$file" "$tmp/index.json" "$dir/"
else
  adb=~/Library/Android/sdk/platform-tools/adb
  "$adb" -s "$device" shell am force-stop com.revisionbuddy.app
  "$adb" -s "$device" push "$tmp/$file" "$tmp/index.json" /data/local/tmp/ >/dev/null
  "$adb" -s "$device" shell run-as com.revisionbuddy.app sh -c "'mkdir -p files/recordings/$uid && rm -f files/recordings/$uid/*.m4a && cp /data/local/tmp/$file /data/local/tmp/index.json files/recordings/$uid/'"
  "$adb" -s "$device" shell rm -f "/data/local/tmp/$file" /data/local/tmp/index.json
fi
rm -rf "$tmp"
echo "placed $id ($day, 41 min) on $target $device"
