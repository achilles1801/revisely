#!/bin/bash
# Volunteers' /record takes, scored end to end on the Mac, one guarded job after another (no one listens to them):
#   1. record_bench.py: the takes in $LAB/data/record-raw/P../ -> a bench with each item's known answer
#   2. checker.py: the words check (recommended settings, the released model)
#   3. record_check.py: did each take do what its item asked, caught or not, false alarms, tajweed at the places
# ITEMS=path/to/docs/record/items.json to use a local copy of the script instead of the live one.
set -e
LAB=${LAB:-$HOME/revisely-mistake-lab}; PY=$LAB/.venv/bin/python; MG=$LAB/tools/memguard.py
H=$(cd "$(dirname "$0")" && pwd)
RAW=$LAB/data/record-raw; BENCH=$LAB/data/record-v1; RUN=$LAB/runs/record-v1
mkdir -p "$RUN"
$PY $MG -- $PY -I $H/record_bench.py --recordings "$RAW" --out "$BENCH" ${ITEMS:+--items "$ITEMS"}
$PY $MG -- $PY -I $H/checker.py --bench "$BENCH" --run "$RUN" --name rec.hisn.wp --ear hisn --jobs 1 \
  --params '{"sub_p": 1.01, "alt_rule": "skeleton", "del_frac": 0.67}'
$PY $MG -- $PY -I $H/record_check.py --bench "$BENCH" --run "$RUN" --words rec.hisn.wp ${ITEMS:+--items "$ITEMS"}
echo "$RUN/record_check.json"
