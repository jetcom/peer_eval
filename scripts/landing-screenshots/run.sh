#!/bin/bash
# Re-shoots the marketing page screenshots (frontend/src/assets/landing/*.webp).
#
# Stands up a throwaway copy of the app outside the Dropbox checkout (node
# can't read node_modules quickly from Dropbox), on a fresh SQLite database
# seeded with two fictional classes, drives it with headless Chrome, and
# converts the captures to WebP. Nothing touches real data, keys or email.
#
# Needs: Google Chrome, cwebp (brew install webp), free ports 3000 and 3001.
# Usage: scripts/landing-screenshots/run.sh
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$HERE/../.." && pwd)
export WORK=${WORK:-${TMPDIR:-/tmp}/peereval-landing-shots}
DB="file:$WORK/demo.db"
mkdir -p "$WORK/out"

echo "== copying app to $WORK"
rsync -a --delete --exclude node_modules --exclude build --exclude '.env*' --exclude '*.db' --exclude '*.db-journal' \
  "$REPO/frontend" "$REPO/backend" "$WORK/"
(cd "$WORK/backend" && env -u DATABASE_URL npm ci --no-audit --no-fund --silent)
(cd "$WORK/frontend" && npm ci --no-audit --no-fund --silent)
mkdir -p "$WORK/shots" && (cd "$WORK/shots" && npm init -y >/dev/null && npm i puppeteer-core --no-audit --no-fund --silent)
export NODE_PATH="$WORK/backend/node_modules:$WORK/shots/node_modules"

echo "== fresh database"
rm -f "$WORK/demo.db"
(cd "$WORK/backend" && DATABASE_URL="$DB" npx prisma db push --skip-generate >/dev/null && DATABASE_URL="$DB" node prisma/seed.js >/dev/null)

echo "== starting servers"
export JWT_SECRET=local-demo-only
(cd "$WORK/backend" && DATABASE_URL="$DB" NODE_ENV=development PORT=3001 FRONTEND_URL=http://localhost:3000 \
  RESEND_API_KEY=re_local_dummy node server.js > "$WORK/backend.log" 2>&1) &
(cd "$WORK/frontend" && BROWSER=none PORT=3000 npx react-scripts start > "$WORK/frontend.log" 2>&1) &
trap 'echo "== stopping servers"; pkill -f "$WORK/backend/node_modules" || true; pkill -f "$WORK/frontend/node_modules" || true; lsof -tnP -iTCP:3000 -iTCP:3001 -sTCP:LISTEN | xargs kill 2>/dev/null || true' EXIT
until curl -sf localhost:3001/api/health >/dev/null; do sleep 1; done
until curl -sf localhost:3000 >/dev/null; do sleep 2; done
sleep 3

echo "== seeding fictional classes"
rm -f "$WORK/tokens.json"
(cd "$WORK/backend" && DATABASE_URL="$DB" node "$HERE/seed-phases-class.js" && DATABASE_URL="$DB" node "$HERE/seed-assignments-class.js")

echo "== capturing"
node "$HERE/capture.js"

echo "== exporting to frontend/src/assets/landing"
for png in "$WORK"/out/*.png; do
  name=$(basename "$png" .png); width=960; [[ $name == hero-* ]] && width=1200
  cwebp -quiet -q 84 -resize $width 0 "$png" -o "$REPO/frontend/src/assets/landing/$name.webp"
done
ls -la "$REPO/frontend/src/assets/landing"
