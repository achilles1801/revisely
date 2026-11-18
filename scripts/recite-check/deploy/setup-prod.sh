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
#   9. Cloud Run's own request logs for the checker dropped: they hold each caller's IP address, user agent and URL
#      (a /check URL names the passage) for 30 days, and nothing reads them (the alerts read Cloud Run's metrics)
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
# Like run, but tried again for up to 2 minutes: Google takes a moment to see what was just made. On Nov 18 2026 the
# role for a service account made a second earlier failed ("does not exist"), and so did the first alert on a log
# metric made a second earlier (404).
again() {
  printf '  $'; printf ' %q' "$@"; printf '\n'
  [ "$YES" = 1 ] || return 0
  local i
  for i in 1 2 3 4 5 6 7 8 9 10 11 12; do "$@" && return 0; echo "  (not there yet; again in 10 s)"; sleep 10; done
  return 1
}
have() { [ "$YES" = 1 ] && "$@" >/dev/null 2>&1; }  # have CMD…: in a real run, whether CMD finds it already there
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
  if have "${G[@]}" iam service-accounts describe "$SA"; then echo "  $RUNTIME is there"
  else run "${G[@]}" iam service-accounts create "$RUNTIME" --display-name "Recitation checker (Cloud Run)"; fi
  if have "${G[@]}" iam service-accounts describe "$PROMOTE_SA"; then echo "  $PROMOTE is there"
  else run "${G[@]}" iam service-accounts create "$PROMOTE" --display-name "Recitation checker: copies images from dev"; fi
  # Firestore can't grant one collection: the service reads entitlements/{uid} (and nothing else, by its code)
  again "${G[@]}" projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" \
    --role roles/datastore.viewer --condition None --format none
  again "${G[@]}" projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$PROMOTE_SA" \
    --role roles/logging.logWriter --condition None --format none
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
  # the Budget API isn't on in production yet (Nov 17 2026); with user credentials it is billed to the --project
  run "${G[@]}" services enable billingbudgets.googleapis.com
  run "${G[@]}" billing budgets create --billing-account "$acct" --display-name "Recitation checker (Cloud Run)" \
    --budget-amount "${BUDGET}USD" --filter-projects "projects/$PROJECT" --filter-labels app=recite-check \
    --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0
}

step 8 "alerts" && {
  if have "${G[@]}" logging metrics describe recite_check_errors; then echo "  the metric recite_check_errors is there"
  else run "${G[@]}" logging metrics create recite_check_errors \
    --description "The recitation checker's health=error lines (scripts/recite-check/health.py)" \
    --log-filter 'resource.type="cloud_run_revision" AND resource.labels.service_name=~"^recite-check" AND jsonPayload.health="error"'
  fi
  M=https://monitoring.googleapis.com/v3/projects/$PROJECT
  ch='' made=''  # a second run reuses the channel and skips the alerts the first one made
  if [ "$YES" = 1 ]; then
    ch=$(curl -fsS "$M/notificationChannels" -H "Authorization: Bearer $(token)" | python3 -c 'import json, sys
c = [x["name"] for x in json.load(sys.stdin).get("notificationChannels", []) if x.get("displayName") == "Recitation checker alerts"]
print(c[0] if c else "")')
    made=$(curl -fsS "$M/alertPolicies" -H "Authorization: Bearer $(token)" | python3 -c 'import json, sys
print("|".join(p["displayName"] for p in json.load(sys.stdin).get("alertPolicies", [])))')
  fi
  if [ -n "$ch" ]; then echo "  the channel is there"
  else ch=$(api POST "$M/notificationChannels" "$(python3 -c 'import json, sys; print(json.dumps({"type": "email",
    "displayName": "Recitation checker alerts", "labels": {"email_address": sys.argv[1]}}))' "$EMAIL")" \
    | python3 -c 'import json, sys; print(json.load(sys.stdin)["name"])'); fi
  for f in errors at-max refused; do
    # "at its maximum": more than MAX - 0.5 instances active
    body=$(sed -e "s#__CHANNEL__#$ch#" -e "s#__MAX_CHECK_LESS_HALF__#$((MAX_CHECK - 1)).5#" \
      -e "s#__MAX_PAIR_LESS_HALF__#$((MAX_PAIR - 1)).5#" "$HERE/alerts/$f.json")
    name=$(echo "$body" | python3 -c 'import json, sys; print(json.load(sys.stdin)["displayName"])')
    case "|$made|" in *"|$name|"*) echo "  alert: $f is there"; continue ;; esac
    for i in 1 2 3 4 5 6 7 8 9 10 11 12; do  # Monitoring may not know a log metric made a second ago (404)
      api POST "$M/alertPolicies" "$body" >/dev/null && break
      [ "$i" = 12 ] && exit 1
      echo "  (not there yet; again in 10 s)"; sleep 10
    done
    echo "  alert: $f"
  done
}

step 9 "drop Cloud Run's request logs for the checker (IP, user agent, URL)" && {
  run "${G[@]}" logging sinks update _Default --add-exclusion "name=recite-check-requests,description=The recitation checker's request logs (IP addresses and passages; checker-prod.md),filter=resource.type=\"cloud_run_revision\" AND resource.labels.service_name=~\"^recite-check\" AND log_id(\"run.googleapis.com/requests\")"
}

[ "$YES" = 1 ] || printf '\n(dry run: nothing was called. With Majd'\''s word: --yes)\n'
