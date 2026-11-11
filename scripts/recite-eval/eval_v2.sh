#!/bin/bash
# Tajweed, madd timing and letters for one model: eval_v2.sh NAME [CHECKPOINT]  (the words tests: eval_ft.sh)
set -e
NAME=$1; CKPT=$2
LAB=${LAB:-$HOME/revisely-mistake-lab}; PY=$LAB/.venv/bin/python; H=$(cd "$(dirname "$0")" && pwd)
cd "$LAB"
[ -n "$CKPT" ] && $PY -I $H/ft_logprobs.py --ckpt "$CKPT" --name "$NAME" --sets qdat,learners,bench
$PY -I $H/qdat_eval.py --ear "$NAME" > runs/qdat/template.$NAME.txt
$PY -I $H/qdat_tajweed.py "$NAME" ecount 0 > runs/qdat/generic.$NAME.txt
EAR_NAME=$NAME $PY -I $H/pros_tajweed.py > runs/v0/pros_tajweed.$NAME.txt 2>/dev/null
$PY -I $H/madd_timing.py "$NAME" > runs/qdat/madd_timing.$NAME.txt 2>/dev/null
EAR_NAME=$NAME JOBS=${JOBS:-8} $PY -I $H/letters_v2.py > runs/v0/letters_v2.$NAME.txt 2>/dev/null
{
  echo "# $NAME"; head -2 runs/qdat/template.$NAME.txt; echo
  $PY -I $H/tajweed_compare.py "$NAME"; echo
  echo "madd, professional-fitted curve (nothing fitted on qdat):"; grep -E "^power" runs/qdat/madd_timing.$NAME.txt; echo
  tail -12 runs/v0/pros_tajweed.$NAME.txt; echo
  cat runs/v0/letters_v2.$NAME.txt
} > runs/eval2.$NAME.txt
echo "runs/eval2.$NAME.txt"
