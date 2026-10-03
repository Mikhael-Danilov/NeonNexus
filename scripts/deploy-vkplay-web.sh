#!/usr/bin/env bash
# Deploy the Neon Nexus web build (app/src/main/assets) to the HTTPS host that
# VK Play iframes. Usage:
#   scripts/deploy-vkplay-web.sh user@host /var/www/html/neon-nexus
set -euo pipefail

DEST_HOST="${1:?usage: deploy-vkplay-web.sh user@host /dest/path}"
DEST_PATH="${2:?usage: deploy-vkplay-web.sh user@host /dest/path}"
SRC="$(cd "$(dirname "$0")/.." && pwd)/app/src/main/assets/"

[ -f "${SRC}index.html" ] || { echo "no index.html in ${SRC}" >&2; exit 1; }

# single-source sync, --delete is correct here (mirror the static site exactly)
rsync -av --delete "${SRC}" "${DEST_HOST}:${DEST_PATH}/"
echo
echo "Deployed to ${DEST_HOST}:${DEST_PATH}/ — verify it plays, then wire the URL"
echo "as the iFrame link per deploy/VK-PLAY-PUBLISHING.md"
