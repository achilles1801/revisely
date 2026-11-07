#!/usr/bin/env bash
# Opens a PR into develop that reverts one merged PR, with auto-merge (the develop-red issue names the
# suspects; .github/workflows/revert-suspect.yml runs this by hand from Actions). It reverts a PR
# merged into develop and nothing else: it refuses anything else.
#
#   bash scripts/e2e/revert-suspect.sh <pr number>     (gh signed in, or GH_TOKEN; run from the repo)
set -euo pipefail

PR=${1:?usage: revert-suspect.sh <pr number>}
case "$PR" in *[!0-9]*) echo "Not a PR number: $PR" >&2; exit 64 ;; esac
REPO=${GITHUB_REPOSITORY:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}

info=$(gh api "repos/$REPO/pulls/$PR")
merged=$(jq -r .merged <<<"$info")
base=$(jq -r .base.ref <<<"$info")
sha=$(jq -r '.merge_commit_sha // empty' <<<"$info")
title=$(jq -r .title <<<"$info")
[ "$merged" = true ] || { echo "#$PR isn't merged: nothing to revert." >&2; exit 1; }
[ "$base" = develop ] || { echo "#$PR was merged into $base, not develop." >&2; exit 1; }
[ -n "$sha" ] || { echo "#$PR has no merge commit." >&2; exit 1; }

git fetch -q origin develop
git merge-base --is-ancestor "$sha" origin/develop || { echo "#$PR's merge commit $sha isn't on develop." >&2; exit 1; }
branch="revert/pr-$PR"
git switch -q -C "$branch" origin/develop
# A merge commit is reverted against its first parent (develop before it); a squash or rebase commit as is.
parents=$(git rev-list --parents -n 1 "$sha" | wc -w)
if [ "$parents" -gt 2 ]; then git revert --no-edit -m 1 "$sha"; else git revert --no-edit "$sha"; fi
git push -q -f origin "$branch"

body="Reverts #$PR ($title), a suspect for develop going red (the \`develop-red\` issue). Opened by \`scripts/e2e/revert-suspect.sh\`; it merges by itself once \`Required\` passes. Reopen the change with a fix once the cause is known."
url=$(gh pr create --repo "$REPO" --base develop --head "$branch" --title "Revert #$PR: $title" --body "$body" 2>/dev/null ||
  gh pr view "$branch" --repo "$REPO" --json url --jq .url)
gh pr merge "$url" --auto --merge
# A PR opened with a workflow's token starts no workflows: CI (`Required`) is started on the branch.
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  gh workflow run ci.yml --repo "$REPO" --ref "$branch" || echo "::warning::Couldn't start CI on $branch; re-run it by hand."
fi
echo "$url"
