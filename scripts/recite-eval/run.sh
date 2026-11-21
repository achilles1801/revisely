#!/bin/bash
# Segment, decode, replay and score one engine on the benchmark (and the learner set if built).
#
#   scripts/recite-eval/run.sh <tag> <engine> <ggml model> [lib dir] [speed]
#
# <tag> names the recite code version (develop, branch, ...); [lib dir] is its src/lib/recite
# (default: this checkout's). Results: ~/revisely-mistake-lab/runs/v0/results/<tag>.<engine>.x<speed>
set -euo pipefail
cd "$(dirname "$0")/../.."
TAG=${1:?tag}
ENGINE=${2:?engine}
MODEL=${3:?model}
LIB=${4:-src/lib/recite}
SPEED=${5:-1}
LAB=${LAB:-$HOME/revisely-mistake-lab}
RUN=${RUN:-$LAB/runs/v0}
PY=$LAB/.venv/bin/python
BENCHES=("$LAB/data/bench-v0")
[ -d "$LAB/data/learners-v0" ] && BENCHES+=("$LAB/data/learners-v0")

for B in "${BENCHES[@]}"; do
  node -r sucrase/register scripts/recite-eval/segment.ts --bench "$B" --run "$RUN" --tag "$TAG" --lib "$LIB"
done
$PY scripts/recite-eval/decode_whisper.py --run "$RUN" --engine "$ENGINE" --model "$MODEL" --tags "$TAG"
for B in "${BENCHES[@]}"; do
  NAME="$TAG.$ENGINE.x$SPEED.$(basename "$B")"
  node -r sucrase/register scripts/recite-eval/replay.ts --bench "$B" --run "$RUN" --engine "$ENGINE" --tag "$TAG" \
    --lib "$LIB" --speed "$SPEED" --name "$NAME"
  $PY scripts/recite-eval/score.py --bench "$B" --run "$RUN" --results "$NAME" --json "$RUN/$NAME.json"
done
