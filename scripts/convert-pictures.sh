#!/bin/bash
# Convert source PNGs to WebP for the app bundle.
# - Files > 20KB: lossy WebP (quality 80) — photos
# - Files <= 20KB: lossless WebP — diagrams/line art
# Only converts if source is newer than output or output is missing.

set -e

SRC_DIR="pictures-src"
OUT_DIR="public/pictures"
THRESHOLD=20480  # 20KB

if ! command -v cwebp &> /dev/null; then
  echo "Error: cwebp not found. Install with: brew install webp"
  exit 1
fi

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: Source directory '$SRC_DIR' not found"
  exit 1
fi

converted=0
skipped=0
total=0

find "$SRC_DIR" -name "*.png" | while read src; do
  # Build output path: pictures-src/eng/... → public/pictures/eng/...
  rel="${src#$SRC_DIR/}"
  out="$OUT_DIR/${rel%.png}.webp"
  total=$((total + 1))

  # Skip if output exists and is newer than source
  if [ -f "$out" ] && [ "$out" -nt "$src" ]; then
    skipped=$((skipped + 1))
    continue
  fi

  # Ensure output directory exists
  mkdir -p "$(dirname "$out")"

  # Choose strategy based on file size
  filesize=$(stat -f%z "$src" 2>/dev/null || stat -c%s "$src" 2>/dev/null)
  if [ "$filesize" -gt "$THRESHOLD" ]; then
    cwebp -q 80 "$src" -o "$out" -quiet
  else
    cwebp -lossless "$src" -o "$out" -quiet
  fi

  converted=$((converted + 1))
done

# Count results (the while loop runs in a subshell so we count after)
total=$(find "$SRC_DIR" -name "*.png" | wc -l | tr -d ' ')
existing=$(find "$OUT_DIR" -name "*.webp" 2>/dev/null | wc -l | tr -d ' ')

src_size=$(du -sh "$SRC_DIR" | cut -f1)
out_size=$(du -sh "$OUT_DIR" 2>/dev/null | cut -f1 || echo "0")

echo "Pictures: $total source PNGs → $existing WebP files"
echo "Size: $src_size (PNG) → $out_size (WebP)"
