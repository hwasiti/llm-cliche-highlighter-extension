#!/bin/sh
# Generates icons/icon{16,32,48,128}.png — an amber rounded square with a
# dark exclamation mark, matching the extension's highlight palette.
# Requires ImageMagick 7 (magick). Run from the extension root.
set -eu
cd "$(dirname "$0")/.."
mkdir -p icons
magick -size 128x128 xc:none \
  -fill '#fcd34d' -draw 'roundRectangle 6,6,122,122,26,26' \
  -fill '#1d1b17' -draw 'roundRectangle 54,28,74,80,10,10' \
  -fill '#1d1b17' -draw 'circle 64,100 64,90' \
  icons/icon128.png
for size in 16 32 48; do
  magick icons/icon128.png -resize ${size}x${size} icons/icon${size}.png
done
echo "icons written"
