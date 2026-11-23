#!/bin/sh
# preview.yml's check before anything is built or published: is this commit on the branch, and did the
# scenario suite pass on its tree? So a run by hand can't skip the gate.
# Writes sha and can_build to GITHUB_OUTPUT. can_build is false when the branch has moved on with other
# app changes: builds use the run's commit, so a newer push's run builds instead.
# Reads TESTED, HEAD_SHA, REF, REPO and GH_TOKEN. Runs from the run's own commit, copies the scripts the
# job needs to RUNNER_TEMP (the commit being published can be older), and leaves that commit checked out.
set -eu

case "$TESTED" in *[!0-9a-f]*|'') echo "::error::A full commit hash, please."; exit 1 ;; esac
[ ${#TESTED} -eq 40 ] || { echo "::error::A full commit hash, please."; exit 1; }
if ! git merge-base --is-ancestor "$TESTED" "$HEAD_SHA" 2>/dev/null; then
  echo "::error::$TESTED is not on $REF: nothing is published."
  exit 1
fi
TREE=$(git rev-parse "$TESTED^{tree}")
RUN=$(gh api "repos/$REPO/actions/artifacts?name=scenarios-passed-$TREE&per_page=30" \
  --jq '[.artifacts[] | select(.expired | not) | select(.workflow_run.head_repository_id == .workflow_run.repository_id)] | first | .workflow_run.id // empty')
if [ -z "$RUN" ]; then
  echo "::error::The scenario suite hasn't passed on $TESTED (tree $TREE): nothing is published."
  exit 1
fi
echo "The scenario suite passed on tree $TREE in run $RUN."
echo "sha=$TESTED" >> "$GITHUB_OUTPUT"
cp .github/scripts/app-hash.sh .github/scripts/publish-update.sh "$RUNNER_TEMP/"
git checkout -q "$TESTED"; TESTED_APP=$(sh "$RUNNER_TEMP/app-hash.sh")
git checkout -q "$HEAD_SHA"; HEAD_APP=$(sh "$RUNNER_TEMP/app-hash.sh")
if [ "$TESTED_APP" = "$HEAD_APP" ]; then
  echo "can_build=true" >> "$GITHUB_OUTPUT"
else
  echo "can_build=false" >> "$GITHUB_OUTPUT"
  echo "$REF has moved on to $HEAD_SHA with other app changes: a native build, if one is needed, comes from that push's run."
fi
# Everything after this works on the tested commit.
git checkout -q "$TESTED"
