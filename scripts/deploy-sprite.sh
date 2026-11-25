#!/usr/bin/env bash
# Build Gala and put it on the Sprite.
#
# What it does: builds the web app here; copies the build, the server, the
# engine and the kit pipeline to /home/sprite/gala on the Sprite; installs
# the kit's packages there; and (re)starts the one service that answers the
# Sprite's URL.
#
# What it never does: it does not touch the Sprite's URL auth, any
# connector, any key, or Convex. It never reads or writes
# /home/sprite/gala.env, where the server's settings and the shared secret
# live (see env.example). Opening the URL to visitors is a separate,
# deliberate step.
set -euo pipefail

SPRITE="${GALA_SPRITE:-gala}"
REMOTE_DIR="/home/sprite/gala"
ENV_FILE="/home/sprite/gala.env"
SPRITE_BIN="${SPRITE_BIN:-$HOME/.local/bin/sprite}"

cd "$(dirname "$0")/.."

echo "Building..."
npm run build

echo "Copying to Sprite '$SPRITE'..."
BUNDLE="$(mktemp -t gala-bundle).tgz"
trap 'rm -f "$BUNDLE"' EXIT
# The kit's packages are installed on the Sprite: the ones here are built for this machine.
COPYFILE_DISABLE=1 tar czf "$BUNDLE" --no-xattrs --exclude node_modules --exclude 'kit/out' dist server engine kit
"$SPRITE_BIN" exec --no-stdin -s "$SPRITE" -- mkdir -p "$REMOTE_DIR"
"$SPRITE_BIN" file push -s "$SPRITE" -p "$BUNDLE" "$REMOTE_DIR/bundle.tgz" >/dev/null
"$SPRITE_BIN" exec --no-stdin -s "$SPRITE" -- sh -c "
  cd $REMOTE_DIR &&
  rm -rf dist server engine kit/src kit/scripts &&
  tar xzf bundle.tgz 2>/dev/null && rm bundle.tgz &&
  cd kit && npm ci --omit=dev --silent
"

echo "Starting the service..."
# The service reads its settings from $ENV_FILE when the file exists.
"$SPRITE_BIN" exec --no-stdin -s "$SPRITE" -- sh -c "
  if sprite-env services get gala >/dev/null 2>&1; then sprite-env services delete gala >/dev/null; fi
  sprite-env services create gala --cmd /usr/bin/env --args node,--env-file-if-exists=$ENV_FILE,$REMOTE_DIR/server/index.mjs --dir $REMOTE_DIR --env PORT=8080 --http-port 8080 --no-stream >/dev/null
  sleep 3
  curl -s -o /dev/null -w 'health check on the Sprite: %{http_code}\n' http://127.0.0.1:8080/healthz
  curl -s -o /dev/null -w 'type data from the engine: %{http_code}\n' http://127.0.0.1:8080/api/fonts
"
