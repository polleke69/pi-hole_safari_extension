#!/usr/bin/env bash
# Square black canvas + logo.svg → PNGs for Safari extension + macOS Dock icns (qlmanage + sips + iconutil).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

node scripts/compose-logo-icon.mjs

SVG="$ROOT/assets/logo-on-black.svg"
MASTER="/tmp/pihole-logo-raster-1024.png"
EXT="$ROOT/extension/icons"
MACSET="/tmp/PiHoleDock.iconset"
LARGE="$ROOT/safari-app/Pi-hole Allowlist/Pi-hole Allowlist/Assets.xcassets/LargeIcon.imageset"
RES="$ROOT/safari-app/Pi-hole Allowlist/Pi-hole Allowlist/Resources"
DEST_MASTER="$ROOT/assets/logo-raster-1024.png"

mkdir -p "$EXT"
rm -rf "$MACSET"
mkdir -p "$MACSET"
rm -f "$MASTER"
qlmanage -t -s 1024 -o /tmp "$SVG" >/dev/null
mv "/tmp/logo-on-black.svg.png" "$MASTER"
cp "$MASTER" "$DEST_MASTER"

for s in 16 32 48 96 128; do
  sips -z "$s" "$s" "$MASTER" --out "$EXT/icon${s}.png" >/dev/null
done

# Full macOS icon layer set for iconutil → Dock-safe AppIcon.icns
sips -z 16 16 "$MASTER" --out "$MACSET/icon_16x16.png" >/dev/null
sips -z 32 32 "$MASTER" --out "$MACSET/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$MASTER" --out "$MACSET/icon_32x32.png" >/dev/null
sips -z 64 64 "$MASTER" --out "$MACSET/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$MASTER" --out "$MACSET/icon_128x128.png" >/dev/null
sips -z 256 256 "$MASTER" --out "$MACSET/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$MASTER" --out "$MACSET/icon_256x256.png" >/dev/null
sips -z 512 512 "$MASTER" --out "$MACSET/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$MASTER" --out "$MACSET/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$MASTER" --out "$MACSET/icon_512x512@2x.png" >/dev/null

iconutil --convert icns --output "$RES/AppIcon.icns" "$MACSET"

sips -z 128 128 "$MASTER" --out "$LARGE/LargeIcon@1x.png" >/dev/null
sips -z 256 256 "$MASTER" --out "$LARGE/LargeIcon@2x.png" >/dev/null
sips -z 384 384 "$MASTER" --out "$LARGE/LargeIcon@3x.png" >/dev/null

sips -z 128 128 "$MASTER" --out "$RES/Icon.png" >/dev/null

echo "Icons OK. Run: npm run sync:safari"
