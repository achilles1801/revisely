#!/bin/bash
# Record a simulator while Maestro runs a flow:
#   scripts/site-clips/take.sh <simulator udid> <flow.yaml> <out.mp4>
# Then cut the take into a loop with cut.py (README.md).
set -u
U=$1; FLOW=$2; OUT=$3
LOG="${OUT%.*}"
xcrun simctl io "$U" recordVideo --codec=h264 --force "$OUT" >"$LOG.rec.log" 2>&1 &
REC=$!
# recordVideo needs a moment before it writes the first frame
for i in 1 2 3 4 5 6 7 8 9 10; do grep -q "Recording started" "$LOG.rec.log" && break; sleep 0.3; done
maestro --device "$U" test "$FLOW" >"$LOG.maestro.log" 2>&1; M=$?
kill -INT $REC; wait $REC
echo "maestro exit $M"; grep -E "FAILED|Error" "$LOG.maestro.log" | head -3
ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT"
