#!/bin/sh
# Cache bust for a deploy. Writes ONE build stamp to every ?v= in index.html and setup.html AND to
# version.json, which the running app checks (js/fresh.js) to reload itself onto the new build.
#   dev/bust.sh            next stamp: today's date plus the next letter (20261112e -> 20261112f)
#   dev/bust.sh 20261113a  that stamp
# Run from the repo root. Fails (exit 1) if anything is left on another stamp.
set -eu
cd "$(dirname "$0")/.."
current=$(sed -n 's/.*app\.js?v=\([0-9a-z]*\).*/\1/p' index.html | head -1)
if [ $# -ge 1 ]; then
  stamp=$1
else
  today=$(date +%Y%m%d)
  case "$current" in
    "$today"?)
      letter=$(printf %s "$current" | cut -c9)
      next=$(printf %s "$letter" | tr 'abcdefghijklmnopqrstuvwxy' 'bcdefghijklmnopqrstuvwxyz')
      [ "$next" = "$letter" ] && { echo "out of letters for $today, pass a stamp" >&2; exit 1; }
      stamp=$today$next ;;
    *) stamp=${today}a ;;
  esac
fi
printf %s "$stamp" | grep -Eq '^[0-9]{8}[a-z0-9]{1,4}$' || { echo "bad stamp: $stamp" >&2; exit 1; }
for f in index.html setup.html; do
  sed -i '' -E "s/\?v=[0-9a-z]+/?v=$stamp/g" "$f"
done
printf '{"v":"%s"}\n' "$stamp" > version.json
others=$(grep -ohE '\?v=[0-9a-z]+' index.html setup.html | sort -u | grep -v "?v=$stamp$" || true)
[ -z "$others" ] || { echo "left on another stamp: $others" >&2; exit 1; }
grep -q "\"v\":\"$stamp\"" version.json || { echo "version.json not written" >&2; exit 1; }
echo "build $current -> $stamp (index.html, setup.html, version.json)"
