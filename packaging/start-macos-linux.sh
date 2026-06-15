#!/usr/bin/env sh
# Serve WaveRider locally and open it in the default browser.
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR/app" || { echo "Could not find the app folder."; exit 1; }

PORT=8765
URL="http://localhost:$PORT/"

open_browser() {
  sleep 2
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 || true
  elif command -v open >/dev/null 2>&1; then
    open "$URL" >/dev/null 2>&1 || true
  fi
}

echo "Starting WaveRider at $URL"
echo "Press Ctrl+C to stop."

if command -v python3 >/dev/null 2>&1; then
  open_browser & exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then
  open_browser & exec python -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then
  open_browser & exec npx --yes serve -l "$PORT" .
else
  echo "Need Python 3 or Node.js to run a local server."
  echo "Install Python from https://www.python.org/ and try again."
  exit 1
fi
