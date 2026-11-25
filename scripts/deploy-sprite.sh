#!/usr/bin/env bash
# Build Gala and put it on the Sprite.
#
# What it does: builds the web app here, copies the build and the server to
# /home/sprite/gala on the Sprite, and (re)starts the one service that
# answers the Sprite's URL.
#
# What it never does: it does not touch the Sprite's URL auth, any connector,
# any key, or Convex. Opening the URL to visitors is a separate, deliberate
# step.
set -euo pipefail

SPRITE="${GALA_SPRITE:-gala}"
REMOTE_DIR="/home/sprite/gala"
SPRITE_BIN="${SPRITE_BIN:-$HOME/.local/bin/sprite}"

cd "$(dirname "$0")/.."

echo "Building..."
npm run build

echo "Copying to Sprite '$SPRITE'..."
"$SPRITE_BIN" exec --no-stdin -s "$SPRITE" -- sh -c "rm -rf $REMOTE_DIR/dist $REMOTE_DIR/server && mkdir -p $REMOTE_DIR"
"$SPRITE_BIN" file push -s "$SPRITE" -r -p dist "$REMOTE_DIR/dist"
"$SPRITE_BIN" file push -s "$SPRITE" -r -p server "$REMOTE_DIR/server"

echo "Starting the service..."
"$SPRITE_BIN" exec --no-stdin -s "$SPRITE" -- sh -c "
  if sprite-env services get gala >/dev/null 2>&1; then
    sprite-env services restart gala
  else
    sprite-env services create gala --cmd /usr/bin/env --args node,$REMOTE_DIR/server/index.mjs --dir $REMOTE_DIR --env PORT=8080 --http-port 8080 --no-stream
  fi
  sleep 1
  curl -s -o /dev/null -w 'health check on the Sprite: %{http_code}\n' http://127.0.0.1:8080/healthz
"
