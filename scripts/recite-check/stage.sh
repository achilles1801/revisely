#!/bin/bash
# Gather what the recitation check's image needs into one folder (README.md says how it is deployed):
#   scripts/recite-check/stage.sh DIR
# The checker at HARNESS_COMMIT, the app's word list, and from the lab (~/revisely-mistake-lab) the model, the
# lexicon, Tanzil's text and the bars. The model and data never go into git; they go into the image only.
set -euo pipefail
STAGE=${1:?usage: stage.sh DIR}
HARNESS_COMMIT=079b8a4c  # scripts/recite-eval on claude/mistake-eval: the checker this service runs
LAB=${LAB:-$HOME/revisely-mistake-lab}
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
PY=${PY:-$LAB/.venv/bin/python}

H=$STAGE/harness/scripts/recite-eval
mkdir -p "$H" "$STAGE/harness/src/data" "$STAGE/lab/models/hisnlabs-tajweed-v2/onnx" "$STAGE/lab/cache" "$STAGE/lab/data"
git -C "$REPO" fetch -q origin claude/mistake-eval
for f in checker.py tajweed.py nasal_rules.py letters.py letters_v2.py bench.py; do
  git -C "$REPO" show "$HARNESS_COMMIT:scripts/recite-eval/$f" > "$H/$f"
done
cp "$REPO/src/data/quranWords.dat" "$STAGE/harness/src/data/"
M=$LAB/models/hisnlabs-tajweed-v2
cp "$M/config.json" "$STAGE/lab/models/hisnlabs-tajweed-v2/"
cp "$M/onnx/model-int8.onnx" "$STAGE/lab/models/hisnlabs-tajweed-v2/onnx/"
cp "$LAB/cache/lexicon.json" "$STAGE/lab/cache/"
cp "$LAB/data/tanzil_uthmani.json" "$STAGE/lab/data/"
LAB=$LAB RECITE_HARNESS=$H "$PY" -I "$HERE/make_bars.py" "$STAGE/lab/bars.json" > /dev/null
cp "$HERE"/{server.py,engine.py,auth.py,store.py,requirements.txt,Dockerfile} "$STAGE/"
git -C "$REPO" rev-parse "$HARNESS_COMMIT" > "$STAGE/CHECKER_COMMIT"
printf '__pycache__/\n' > "$STAGE/.gcloudignore"
echo "staged in $STAGE"
