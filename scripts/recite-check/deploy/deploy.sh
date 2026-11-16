#!/bin/bash
# Deploy the recitation checker's two services (recite-check, recite-check-pair) from one image, with the settings in
# dev.env or prod.env: dev and production differ only in those files (README.md, "Deploying").
#
#   deploy.sh dev  --source STAGE_DIR [--yes]    build STAGE_DIR (stage.sh) in Cloud Build, deploy both, no traffic
#   deploy.sh ENV  --image REPO@sha256:… [--yes] deploy that image to both, no traffic (prod: dev's image, copied in)
#   deploy.sh ENV  --migrate [--yes]             move both services' traffic to the new revisions, tag the image
#
# ENV is dev, prod, or the path of an env file. Without --yes it prints what it would do and calls no API at all, so a
# dry run against production touches nothing. A new revision gets the env file's TAG and no traffic: the script checks
# its /health and that a call without a sign-in is refused; test it at its tag's URL, then --migrate. A service that
# doesn't exist yet is created with the traffic (Cloud Run can't create one without it): in production only the first
# deploy in setup-prod.sh does that, on Majd's word.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ENV=${1:?usage: deploy.sh dev|prod|FILE --source DIR | --image REF | --migrate [--yes]}
shift
if [ -f "$ENV" ]; then FILE=$ENV; else FILE=$HERE/$ENV.env; fi
[ -f "$FILE" ] || { echo "no $FILE"; exit 2; }
DEV_REPO=
# shellcheck source=/dev/null
. "$FILE"
MODE='' ARG='' YES=0
while [ $# -gt 0 ]; do
  case $1 in
    --source) MODE=source ARG=${2:?}; shift 2 ;;
    --image) MODE=image ARG=${2:?}; shift 2 ;;
    --migrate) MODE=migrate; shift ;;
    --yes) YES=1; shift ;;
    *) echo "unknown: $1"; exit 2 ;;
  esac
done
[ -n "$MODE" ] || { echo "say --source, --image or --migrate"; exit 2; }
[[ "$PROJECT_NUMBER" =~ ^[0-9]+$ ]] || { echo "$FILE has no PROJECT_NUMBER yet (setup-prod.sh prints it)"; exit 2; }
G=(gcloud --project "$PROJECT" --quiet)
R=(--region "$REGION")

say() { printf '\n== %s\n' "$*"; }
# A command that changes something: printed, and run only with --yes.
run() {
  printf '  $'; printf ' %q' "$@"; printf '\n'
  [ "$YES" = 1 ] || return 0
  "$@"
}
dry() { [ "$YES" != 1 ]; }

exists() {  # whether a Cloud Run service exists (a dry run assumes it does)
  dry && return 0
  "${G[@]}" run services describe "$1" "${R[@]}" --format 'value(metadata.name)' >/dev/null 2>&1
}

traffic() {  # traffic SERVICE WHICH: "REVISION URL" of the revision tagged TAG (WHICH=tag) or serving most (now)
  if dry; then echo "<$1:$2> https://$TAG---$1-<hash>.$REGION.run.app"; return; fi
  "${G[@]}" run services describe "$1" "${R[@]}" --format json | python3 -c '
import json, sys
which, tag = sys.argv[1], sys.argv[2]
t = json.load(sys.stdin)["status"].get("traffic", [])
t = [x for x in t if x.get("tag") == tag] if which == "tag" else sorted(t, key=lambda x: -x.get("percent", 0))[:1]
print(t[0].get("revisionName", "?"), t[0].get("url", "-")) if t else print("? -")' "$2" "$TAG"
}

image_of() {  # a revision's image, by digest
  if dry; then echo "<image of $1>@sha256:<digest>"; return; fi
  "${G[@]}" run revisions describe "$1" "${R[@]}" --format 'value(status.imageDigest)'
}

flags() {  # the settings both services share, then each one's (no value holds a space)
  local common="--execution-environment gen1 --cpu 1 --memory 2Gi --timeout 1200 --session-affinity --cpu-boost"
  common="$common --service-account $SA --labels app=recite-check"
  if [ "$1" = recite-check ]; then
    echo "$common --concurrency 1 --min-instances $MIN_CHECK --max-instances $MAX_CHECK --set-env-vars=^@^$ENV_CHECK"
  else
    echo "$common --concurrency 2 --min-instances $MIN_PAIR --max-instances $MAX_PAIR --set-env-vars=^@^$ENV_PAIR"
  fi
}

deploy_one() {  # deploy_one SERVICE --image REF | --source DIR
  local svc=$1; shift
  local f
  read -r -a f <<< "$(flags "$svc")"
  if exists "$svc"; then
    run "${G[@]}" run deploy "$svc" "${R[@]}" "$@" "${f[@]}" --no-traffic --tag "$TAG"
  else
    say "$svc doesn't exist yet: it is created with the traffic (Cloud Run can't create a service without it)"
    run "${G[@]}" run deploy "$svc" "${R[@]}" "$@" "${f[@]}" --tag "$TAG"
  fi
}

check() {  # check SERVICE: its tagged revision answers /health as a serving checker should, and refuses no sign-in
  local svc=$1 rev url code
  read -r rev url < <(traffic "$svc" tag)
  say "$svc: $rev at $url"
  if dry; then echo "  (would check $url/health and that an unsigned POST /check is refused)"; return 0; fi
  [ "$rev" != "?" ] || { echo "  no revision tagged $TAG"; exit 1; }
  curl -fsS --max-time 60 "$url/health" | python3 -c '
import json, sys
h = json.load(sys.stdin)
print("  /health:", json.dumps(h))
bad = [why for ok, why in ((h.get("ok") is True, "not ok"), (h.get("words") is True, "no word table"),
       (h.get("protocol", 0) >= 7, "protocol below 7"), (not h.get("paused"), "paused"),
       (bool(h.get("ears")), "no ears")) if not ok]
sys.exit("  NOT READY: " + ", ".join(bad)) if bad else print("  ready")'
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 -X POST "$url/check?s=1&a=1")
  [ "$code" = 401 ] || { echo "  an unsigned /check answered $code, not 401"; exit 1; }
  echo "  an unsigned /check is refused (401)"
}

case $MODE in
  source)
    [ "$SOURCE_OK" = 1 ] || { echo "$FILE takes only an image dev has run (--image)"; exit 2; }
    [ -f "$ARG/Dockerfile" ] || { echo "$ARG isn't a staged folder (stage.sh)"; exit 2; }
    say "build $ARG in Cloud Build and deploy it to recite-check ($PROJECT), no traffic"
    deploy_one recite-check --source "$ARG"
    read -r rev _ < <(traffic recite-check tag)
    img=$(image_of "$rev")
    say "recite-check-pair from the same image"
    deploy_one recite-check-pair --image "$img"
    check recite-check; check recite-check-pair
    ;;
  image)
    img=$ARG
    case $img in *@sha256:*) ;; *) echo "an image by digest (…@sha256:…), so what's deployed is what was tested"; exit 2 ;; esac
    if [ -n "$DEV_REPO" ]; then  # production: only an image dev ran, copied into production's own repository
      case $img in "$DEV_REPO"@sha256:*) ;; *) echo "this project takes only $DEV_REPO@sha256:…"; exit 2 ;; esac
      say "copy the image into $PROJECT's repository (Cloud Build as $PROMOTE_SA; the digest stays the same)"
      run "${G[@]}" builds submit --no-source --region "$REGION" --config "$HERE/copy-image.yaml" \
        --service-account "projects/$PROJECT/serviceAccounts/$PROMOTE_SA" \
        --substitutions "_SRC=$img,_DST=$REPO:copied-${img#*@sha256:}"
      img="$REPO@${img#*@}"
    fi
    say "deploy $img to both services ($PROJECT), no traffic"
    deploy_one recite-check --image "$img"
    deploy_one recite-check-pair --image "$img"
    check recite-check; check recite-check-pair
    ;;
  migrate)
    read -r rev _ < <(traffic recite-check tag)
    read -r prev _ < <(traffic recite-check now)
    read -r prev_pair _ < <(traffic recite-check-pair now)
    if ! dry && [ "$rev" = "?" ]; then echo "no revision tagged $TAG on recite-check"; exit 1; fi
    say "traffic: recite-check to $rev (from $prev); recite-check-pair to its latest (it follows its latest)"
    run "${G[@]}" run services update-traffic recite-check "${R[@]}" --to-revisions "$rev=100"
    run "${G[@]}" run services update-traffic recite-check-pair "${R[@]}" --to-latest
    img=$(image_of "$rev")
    say "tag the image $SERVING_TAG (the repository's cleanup keeps it)"
    run "${G[@]}" artifacts docker tags add "$img" "${img%@*}:$SERVING_TAG"
    say "to roll back"
    echo "  gcloud --project $PROJECT run services update-traffic recite-check --region $REGION --to-revisions $prev=100"
    echo "  gcloud --project $PROJECT run services update-traffic recite-check-pair --region $REGION --to-revisions $prev_pair=100"
    ;;
esac
if dry; then printf '\n(dry run: nothing was called. Add --yes to do it.)\n'; fi
