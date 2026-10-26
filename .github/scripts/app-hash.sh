#!/bin/sh
# A hash of what goes into the app at HEAD: every tracked file except those that never reach a phone
# (the same paths the release workflows ignore, plus the workflows themselves). preview.yml stamps it
# on each preview update; promote.yml promotes only the update with main's hash. So a docs, store or
# scripts change on either branch neither publishes anything nor stops a tested update being promoted.
set -eu
git ls-tree -r HEAD \
  | grep -vE '	(docs/|tests/|functions/|worker/|\.maestro/|store/|scripts/|\.github/)' \
  | grep -vE '	(.*\.md|firestore\.rules|firestore\.indexes\.json|firebase\.json|wrangler\.jsonc)$' \
  | git hash-object --stdin
