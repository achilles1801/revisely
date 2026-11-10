#!/bin/bash
# Every test for one model: eval_ft.sh NAME [CHECKPOINT]  (NAME hisn = the current model, its outputs already cached)
set -e
NAME=$1; CKPT=$2
LAB=${LAB:-$HOME/revisely-mistake-lab}; PY=$LAB/.venv/bin/python; H=$(cd "$(dirname "$0")" && pwd)
cd "$LAB"
[ -n "$CKPT" ] && $PY -I $H/ft_logprobs.py --ckpt "$CKPT" --name "$NAME" --sets qdat,learners,bench
$PY -I $H/qdat_eval.py --ear "$NAME" > runs/qdat/template.$NAME.txt
$PY -I $H/qdat_tajweed.py "$NAME" ecount 0 > runs/qdat/generic.$NAME.txt
EAR_NAME=$NAME $PY -I $H/pros_tajweed.py > runs/v0/pros_tajweed.$NAME.txt 2>/dev/null
EAR_NAME=$NAME $PY -I $H/letters_eval.py > runs/v0/letters_eval.$NAME.txt 2>/dev/null
P='{"sub_p": 1.01, "alt_rule": "skeleton", "del_frac": 0.67}'
$PY -I $H/checker.py --bench data/bench-v0 --run runs/v0 --name ft.$NAME.wp --ear "$NAME" --jobs 10 --params "$P" 2>/dev/null
$PY -I $H/checker.py --bench data/learners-v0 --run runs/v0 --name learners.ft.$NAME.wp --ear "$NAME" --jobs 10 --params "$P" 2>/dev/null
$PY -I $H/checker.py --bench data/bench-v0 --run runs/v0 --name ft.$NAME.words --ear "$NAME" --jobs 10 --params '{"sound_rule": "off", "alts": 0}' 2>/dev/null
$PY -I $H/checker.py --bench data/learners-v0 --run runs/v0 --name learners.ft.$NAME.words --ear "$NAME" --jobs 10 --params '{"sound_rule": "off", "alts": 0}' 2>/dev/null
{
  echo "# $NAME"; cat runs/qdat/template.$NAME.txt; echo; cat runs/qdat/generic.$NAME.txt; echo
  $PY -I $H/tajweed_compare.py "$NAME"; echo; cat runs/v0/letters_eval.$NAME.txt; echo
  $PY -I $H/score.py --bench data/bench-v0 --run runs/v0 --results ft.$NAME.wp,ft.$NAME.words --by condition | head -20
  $PY -I $H/learner_flags.py learners.ft.$NAME.wp | head -1; $PY -I $H/learner_flags.py learners.ft.$NAME.words | head -1
} > runs/eval.$NAME.txt
echo "runs/eval.$NAME.txt"
