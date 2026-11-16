#!/bin/bash
# The recitation checker in production, set up once (the plan: ~/Documents/revisely-release/checker-prod.md).
# NOTHING HERE RUNS WITHOUT MAJD'S WORD. Without --yes it prints every step and calls no API.
#
#   setup-prod.sh [--yes] --image DEV_REPO@sha256:… --email ADDRESS [--budget 50] [--step N]
#
#   --image   the image dev has run (tag `serving` in dev's repository), copied in by its digest
#   --email   where the alerts go (not kept in the repository)
#   --budget  the monthly budget in US dollars for the checker's Cloud Run spend (default 50)
#   --step N  start at step N (after one that failed)
#
# Steps:
#   1. the project's number (written into prod.env by hand; deploy.sh refuses without it)
#   2. two service accounts: recite-check (the services; reads Firestore) and recite-check-promote (copies images in)
#   3. the image repository, with dev's cleanup policies (in dry run, as dev's)
#   4. the promote account may read dev's repository (read-only), and write production's
#   5. the first deploy (deploy.sh prod --image … --yes): both services are created and take the traffic
#   6. both services open to the internet (the app signs in with Firebase; the server checks it, App Check, Premium)
#   7. a budget on the checker's spend (label app=recite-check), emailing at 50, 90 and 100%
#   8. a log metric for the health lines' errors, an email channel, and the three alerts in alerts/
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
# shellcheck source=/dev/null
. "$HERE/prod.env"
YES=0 IMAGE='' EMAIL='' BUDGET=50 FROM=1
while [ $# -gt 0 ]; do
  case $1 in
    --yes) YES=1; shift ;;
    --image) IMAGE=${2:?}; shift 2 ;;
    --email) EMAIL=${2:?}; shift 2 ;;
    --budget) BUDGET=${2:?}; shift 2 ;;
    --step) FROM=${2:?}; shift 2 ;;
    *) echo "unknown: $1"; exit 2 ;;
  esac
done
case $IMAGE in "$DEV_REPO"@sha256:*) ;; *) echo "--image $DEV_REPO@sha256:… (the image dev serves)"; exit 2 ;; esac
[ -n "$EMAIL" ] || { echo "--email ADDRESS (where the alerts go)"; exit 2; }
G=(gcloud --project "$PROJECT" --quiet)
RUNTIME=${SA%%@*}
PROMOTE=${PROMOTE_SA%%@*}
REPO_NAME=$(echo "$REPO" | cut -d/ -f3)

step() { STEP=$1; shift; [ "$STEP" -ge "$FROM" ] && printf '\n== %s. %s\n' "$STEP" "$*"; }
due() { [ "$STEP" -ge "$FROM" ]; }
run() {
  printf '  $'; printf ' %q' "$@"; printf '\n'
  [ "$YES" = 1 ] || return 0
  "$@"
}
token() { gcloud auth print-access-token; }
api() {  # api METHOD URL [JSON]: Cloud Monitoring's REST API (no gcloud component needed)
  printf '  $ curl -X %s %s%s\n' "$1" "$2" "${3:+ (a JSON body)}" >&2
  [ "$YES" = 1 ] || { echo '{"name": "<made in a real run>"}'; return 0; }
  curl -fsS -X "$1" "$2" -H "Authorization: Bearer $(token)" -H 'Content-Type: application/json' ${3:+-d "$3"}
}

step 1 "the project's number" && {
  if [ "$YES" = 1 ]; then
    n=$("${G[@]}" projects describe "$PROJECT" --format 'value(projectNumber)')
    echo "  $n"
    [ "$PROJECT_NUMBER" = "$n" ] || { echo "  write PROJECT_NUMBER=$n into prod.env (a PR), then run again with --step 2"; exit 1; }
  else
    echo "  (would read: gcloud projects describe $PROJECT --format 'value(projectNumber)'; it must match prod.env)"
  fi
}

step 2 "service accounts" && {
  run "${G[@]}" iam service-accounts create "$RUNTIME" --display-name "Recitation checker (Cloud Run)"
  run "${G[@]}" iam service-accounts create "$PROMOTE" --display-name "Recitation checker: copies images from dev"
  # Firestore can't grant one collection: the service reads entitlements/{uid} (and nothing else, by its code)
  run "${G[@]}" projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" \
    --role roles/datastore.viewer --condition None
  run "${G[@]}" projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$PROMOTE_SA" \
    --role roles/logging.logWriter --condition None
}

step 3 "the image repository" && {
  run "${G[@]}" artifacts repositories create "$REPO_NAME" --location "$REGION" --repository-format docker \
    --description "The recitation checker's images, copied from revisely-dev by digest (deploy.sh)"
  run "${G[@]}" artifacts repositories set-cleanup-policies "$REPO_NAME" --location "$REGION" \
    --policy "$HERE/cleanup-policy.json" --dry-run
}

step 4 "the promote account: reads dev's repository, writes production's" && {
  run "${G[@]}" artifacts repositories add-iam-policy-binding "$REPO_NAME" --location "$REGION" \
    --member "serviceAccount:$PROMOTE_SA" --role roles/artifactregistry.writer
  run gcloud --project revisely-dev --quiet artifacts repositories add-iam-policy-binding cloud-run-source-deploy \
    --location us-east1 --member "serviceAccount:$PROMOTE_SA" --role roles/artifactregistry.reader
}

step 5 "the first deploy: both services created, with the traffic" && {
  if [ "$YES" = 1 ]; then "$HERE/deploy.sh" prod --image "$IMAGE" --yes || true  # /health needs step 6 first
  else "$HERE/deploy.sh" prod --image "$IMAGE" | sed 's/^/  /' || echo "  (deploy.sh needs prod.env's PROJECT_NUMBER: step 1)"; fi
}

step 6 "open both services to the internet" && {
  for svc in recite-check recite-check-pair; do
    run "${G[@]}" run services add-iam-policy-binding "$svc" --region "$REGION" --member allUsers --role roles/run.invoker
  done
  due && [ "$YES" = 1 ] && for svc in recite-check recite-check-pair; do
    url=$("${G[@]}" run services describe "$svc" --region "$REGION" --format 'value(status.url)')
    echo "  $svc: $url"; curl -fsS --max-time 60 "$url/health"; echo
  done
}

step 7 "a budget on the checker's spend (\$$BUDGET a month)" && {
  if [ "$YES" = 1 ]; then
    acct=$("${G[@]}" billing projects describe "$PROJECT" --format 'value(billingAccountName)'); acct=${acct#billingAccounts/}
  else acct='<the billing account>'; fi
  run gcloud billing budgets create --billing-account "$acct" --display-name "Recitation checker (Cloud Run)" \
    --budget-amount "${BUDGET}USD" --filter-projects "projects/$PROJECT" --filter-labels app=recite-check \
    --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0
}

step 8 "alerts" && {
  run "${G[@]}" logging metrics create recite_check_errors \
    --description "The recitation checker's health=error lines (scripts/recite-check/health.py)" \
    --log-filter 'resource.type="cloud_run_revision" AND resource.labels.service_name=~"^recite-check" AND jsonPayload.health="error"'
  M=https://monitoring.googleapis.com/v3/projects/$PROJECT
  ch=$(api POST "$M/notificationChannels" "$(python3 -c 'import json, sys; print(json.dumps({"type": "email",
    "displayName": "Recitation checker alerts", "labels": {"email_address": sys.argv[1]}}))' "$EMAIL")" \
    | python3 -c 'import json, sys; print(json.load(sys.stdin)["name"])')
  for f in errors at-max refused; do
    # "at its maximum": more than MAX - 0.5 instances active
    body=$(sed -e "s#__CHANNEL__#$ch#" -e "s#__MAX_CHECK_LESS_HALF__#$((MAX_CHECK - 1)).5#" \
      -e "s#__MAX_PAIR_LESS_HALF__#$((MAX_PAIR - 1)).5#" "$HERE/alerts/$f.json")
    api POST "$M/alertPolicies" "$body" >/dev/null
    echo "  alert: $f"
  done
}

[ "$YES" = 1 ] || printf '\n(dry run: nothing was called. With Majd'\''s word: --yes)\n'
