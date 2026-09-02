#!/usr/bin/env bash
# Sets the 4 GitHub Actions secrets required by .github/workflows/play-publish.yml.
# Prereqs: gh authenticated (gh auth login), this run from the repo root.
# Usage: scripts/set-play-secrets.sh <play-service-account.json>
set -euo pipefail
cd "$(dirname "$0")/.."

SA_JSON="${1:?usage: $0 <play-service-account.json>}"
[ -f "$SA_JSON" ] || { echo "service account JSON not found: $SA_JSON" >&2; exit 1; }
[ -f my-upload-key.jks ] || { echo "my-upload-key.jks not found in repo root" >&2; exit 1; }
PASS=$(sed -n 's/^store+key password: //p' keystore-credentials.txt)
[ -n "$PASS" ] || { echo "password not found in keystore-credentials.txt" >&2; exit 1; }

gh secret set PLAY_SERVICE_ACCOUNT_JSON < "$SA_JSON"
gh secret set ANDROID_KEYSTORE_BASE64 < <(base64 -w0 my-upload-key.jks)
gh secret set ANDROID_KEYSTORE_PASSWORD <<< "$PASS"
gh secret set ANDROID_KEY_PASSWORD <<< "$PASS"
echo "All 4 secrets set: PLAY_SERVICE_ACCOUNT_JSON, ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_PASSWORD"
