#!/bin/sh
# One over-the-air update for preview.yml's publishing half, then its source maps for Sentry.
#   publish-update.sh <channel> <EAS environment> [clear]
# `clear` empties the bundler's cache first: Revisely Dev's update can follow preview's on one machine,
# and a transform cached with preview's config must never reach Dev's bundle.
# Reads MESSAGE (empty: the commit's first line), PLATFORM, DRY_RUN and SENTRY_AUTH_TOKEN.
# preview.yml runs the copy from the workflow's own commit: the commit being published can be older.
set -eu

CHANNEL=$1
ENVIRONMENT=$2
CLEAR=${3:-}

# Short enough that the hash survives: EAS lists messages cut at 512 characters.
[ -n "${MESSAGE:-}" ] || MESSAGE=$(git log -1 --format=%s HEAD)
SUBJECT=$(printf '%s\n' "$MESSAGE" | head -n 1 | cut -c 1-300)
APP=$(sh .github/scripts/app-hash.sh)

if [ "${DRY_RUN:-}" = true ]; then
  echo "Dry run: would publish $(git rev-parse HEAD) to $CHANNEL ($PLATFORM) as: $SUBJECT [app $APP]"
  exit 0
fi

if [ "$CLEAR" = clear ]; then
  eas update --channel "$CHANNEL" --environment "$ENVIRONMENT" --platform "$PLATFORM" \
    --message "$SUBJECT [app $APP]" --non-interactive --clear-cache
else
  eas update --channel "$CHANNEL" --environment "$ENVIRONMENT" --platform "$PLATFORM" \
    --message "$SUBJECT [app $APP]" --non-interactive
fi

# Left in dist/ by eas update, so Sentry shows crashes with file names and lines. A failure here never
# fails the publish: the update is already out.
if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
  SENTRY_ORG=revisely SENTRY_PROJECT=react-native SENTRY_URL=https://sentry.io/ \
    npx sentry-expo-upload-sourcemaps dist || echo "::warning title=Sentry::Source maps for $CHANNEL weren't uploaded."
fi
