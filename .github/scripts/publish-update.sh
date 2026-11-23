#!/bin/sh
# One over-the-air update, then its source maps for Sentry (preview.yml, dev-at-merge.yml).
#   publish-update.sh preview production
#   publish-update.sh dev development        only what the dev channel doesn't already have
#   publish-update.sh dev development check  prints needed=true or needed=false, publishes nothing
#
# Dev gets a commit at its merge (dev-at-merge.yml) and again after the tests (preview.yml), so an
# older commit can arrive after a newer one. Each Dev update's message carries [commit <sha>], and a
# platform whose latest update on this runtime already holds this commit is left alone: Dev never
# goes backwards. Runs that publish to dev hold the concurrency group eas-dev, so check and publish
# are one step.
#
# Reads MESSAGE (empty: the commit's first line), PLATFORM (ios, android or all), DRY_RUN,
# SENTRY_AUTH_TOKEN and, for dev, DEV_IOS_RUNTIME and DEV_ANDROID_RUNTIME (empty: not compared).
# The workflows run the copy from their own commit: the commit being published can be older.
set -eu

CHANNEL=$1
ENVIRONMENT=$2
MODE=${3:-publish}
COMMIT=$(git rev-parse HEAD)

# Whether the channel's latest update for this platform and runtime holds this commit.
has_it() {
  platform=$1
  runtime=$2
  [ -n "$runtime" ] || return 1
  latest=$(eas update:list --branch "$CHANNEL" --platform "$platform" --runtime-version "$runtime" \
    --limit 1 --json --non-interactive 2>/dev/null | jq -r '.currentPage[0].message // empty' 2>/dev/null) || return 1
  there=$(printf '%s' "$latest" | sed -n 's/.*\[commit \([0-9a-f]\{40\}\)\].*/\1/p')
  [ -n "$there" ] || return 1
  git cat-file -e "$there^{commit}" 2>/dev/null || git fetch -q origin "$there" 2>/dev/null || return 1
  git merge-base --is-ancestor "$COMMIT" "$there" 2>/dev/null
}

if [ "$CHANNEL" = dev ]; then
  case "$PLATFORM" in all) wanted="ios android" ;; *) wanted=$PLATFORM ;; esac
  missing=""
  for p in $wanted; do
    if [ "$p" = ios ]; then runtime=${DEV_IOS_RUNTIME:-}; else runtime=${DEV_ANDROID_RUNTIME:-}; fi
    if has_it "$p" "$runtime"; then
      echo "dev already has $COMMIT or newer on $p."
    else
      missing="$missing $p"
    fi
  done
  missing=${missing# }
  if [ "$MODE" = check ]; then
    if [ -n "$missing" ]; then echo "needed=true"; else echo "needed=false"; fi
    exit 0
  fi
  [ -n "$missing" ] || { echo "Nothing to publish to dev."; exit 0; }
  case "$missing" in *" "*) PLATFORM=all ;; *) PLATFORM=$missing ;; esac
fi

# Short enough that the hash survives: EAS lists messages cut at 512 characters.
[ -n "${MESSAGE:-}" ] || MESSAGE=$(git log -1 --format=%s HEAD)
SUBJECT=$(printf '%s\n' "$MESSAGE" | head -n 1 | cut -c 1-300)
APP=$(sh .github/scripts/app-hash.sh)
if [ "$CHANNEL" = dev ]; then
  STAMPED="$SUBJECT [commit $COMMIT] [app $APP]"
else
  STAMPED="$SUBJECT [app $APP]"
fi

if [ "${DRY_RUN:-}" = true ]; then
  echo "Dry run: would publish $COMMIT to $CHANNEL ($PLATFORM) as: $STAMPED"
  exit 0
fi

eas update --channel "$CHANNEL" --environment "$ENVIRONMENT" --platform "$PLATFORM" \
  --message "$STAMPED" --non-interactive

# Left in dist/ by eas update, so Sentry shows crashes with file names and lines. A failure here never
# fails the publish: the update is already out.
if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
  SENTRY_ORG=revisely SENTRY_PROJECT=react-native SENTRY_URL=https://sentry.io/ \
    npx sentry-expo-upload-sourcemaps dist || echo "::warning title=Sentry::Source maps for $CHANNEL weren't uploaded."
fi
