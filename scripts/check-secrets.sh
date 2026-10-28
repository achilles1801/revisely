#!/usr/bin/env bash
# Fails if a tracked file holds something that looks like a secret: API keys,
# tokens, private keys, App Check debug tokens. The repository is public.
# Run by CI (.github/workflows/ci.yml, "Secret scan"); run it yourself before
# pushing with `bash scripts/check-secrets.sh`. `--self-test` checks that every
# pattern still catches a sample (and leaves a clean line alone).
#
# High-signal patterns only (no entropy guessing), so a hit is worth stopping
# for. A real secret that was committed must be revoked, not just deleted:
# it stays in git history.

set -euo pipefail

# name|extended regex (grep -E, case-insensitive)
PATTERNS=(
  'App Check debug token|debug_?token.{0,40}[=:].{0,40}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
  'private key|-----BEGIN [A-Z ]*PRIVATE KEY-----'
  'Google service account|"private_key_id"[[:space:]]*:'
  'Google API key|AIza[0-9A-Za-z_-]{35}'
  'Anthropic API key|sk-ant-[A-Za-z0-9_-]{20,}'
  'OpenAI API key|sk-(proj-)?[A-Za-z0-9]{40,}'
  'GitHub token|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}'
  'Sentry token|sntry[su]_[A-Za-z0-9_=+/-]{20,}'
  'AWS access key|AKIA[0-9A-Z]{16}'
  'Slack token|xox[abprs]-[A-Za-z0-9-]{10,}'
  'Stripe live key|(sk|rk)_live_[0-9A-Za-z]{20,}'
  'The Clear Quran API key|tcq_[a-z]{3}_(liv|sbx)_[A-Za-z0-9]{16,}'
  'Expo token|EXPO_TOKEN[[:space:]]*[=:][[:space:]]*["'"'"']?[A-Za-z0-9_-]{30,}'
)

# This file names the patterns; nothing else is exempt.
EXCLUDE=(':!scripts/check-secrets.sh')

self_test() {
  # Each sample is split into two quoted pieces that bash joins at run time, so this file never
  # holds a whole secret-shaped string (GitHub push protection would rightly refuse it).
  local samples=(
    "const DEBUG_TOKEN: string | undefined = 'D542F937-3048-47D7-""A71E-A96F3AD19A6A';"
    'EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN=0B1C2D3E-4F50-6172-''8394-A5B6C7D8E9F0'
    '-----BEGIN PRI''VATE KEY-----'
    '  "private_''key_id": "abc",'
    'apiKey: "AIza''SyA1234567890abcdefghijklmnopqrstuv"'
    'key = "sk-ant''-api03-abcdefghijklmnopqrstuvwxyz0123"'
    'OPENAI=sk-proj''-abcdefghijklmnopqrstuvwxyz0123456789ABCDEF'
    'token ghp''_abcdefghijklmnopqrstuvwxyz0123456789'
    'SENTRY=sntrys''_abcdefghijklmnopqrstuvwxyz'
    'AKIA''ABCDEFGHIJKLMNOP'
    'xoxb''-1234567890-abcdef'
    'sk_li''ve_abcdefghijklmnopqrstuvwx'
    'TCQ=tcq_eng_liv''_0123456789abcdef0123'
    'EXPO_TOKEN=abcdefghijklmn''opqrstuvwxyz0123456789'
  )
  local clean=(
    "const DEBUG_TOKEN = __DEV__ ? debugTokenFor(true, process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN) : undefined;"
    "projectId: '32c71b6d-0a13-454c-916d-11d27f168fa8'"
    "TCQ_API_KEY_LIVE: 'tcq_eng_liv_TEST'"
    'EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN='
  )
  local failed=0 line entry hit
  for line in "${samples[@]}"; do
    hit=0
    for entry in "${PATTERNS[@]}"; do
      if printf '%s\n' "$line" | grep -qiE -- "${entry#*|}"; then hit=1; break; fi
    done
    if [ "$hit" -eq 0 ]; then echo "self-test: not caught: $line"; failed=1; fi
  done
  for line in "${clean[@]}"; do
    for entry in "${PATTERNS[@]}"; do
      if printf '%s\n' "$line" | grep -qiE -- "${entry#*|}"; then
        echo "self-test: false alarm (${entry%%|*}): $line"
        failed=1
      fi
    done
  done
  if [ "$failed" -ne 0 ]; then exit 1; fi
  echo "self-test: ${#samples[@]} samples caught, ${#clean[@]} clean lines left alone"
}

if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit 0
fi

cd "$(git rev-parse --show-toplevel)"
found=0
for entry in "${PATTERNS[@]}"; do
  name="${entry%%|*}"
  regex="${entry#*|}"
  # Paths and line numbers only: never print the match itself (CI logs are public).
  if hits=$(git grep -nIiE -l -- "$regex" -- . "${EXCLUDE[@]}"); then
    while IFS= read -r file; do
      lines=$(git grep -nIiE -- "$regex" -- "$file" | cut -d: -f2 | paste -sd, -)
      echo "::error file=$file::Looks like a ${name} (line ${lines}). Remove it, and revoke it if it was real."
    done <<< "$hits"
    found=1
  fi
done

if [ "$found" -ne 0 ]; then
  echo "Secret scan failed. Secrets belong in EAS environment variables, GitHub secrets, worker secrets or your local .env, never in the repository."
  exit 1
fi
echo "Secret scan: no secrets in $(git ls-files | wc -l | tr -d ' ') tracked files."
