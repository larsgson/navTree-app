#!/bin/bash
# Fetch content from the animal-health repo into the project structure.
# Usage: bash scripts/fetch-content.sh [repo] [languages]
#   repo       - GitHub repo (default: larsgson/animal-health)
#   languages  - comma-separated list (default: eng)
#
# Content mapping:
#   content/{lang}/{book}/       -> src/data/content/{lang}/{book}/
#   content/pictures/{lang}/{book}/ -> pictures-src/{lang}/{book}/

set -euo pipefail

REPO="${1:-larsgson/animal-health}"
LANGS="${2:-eng}"
BOOK="iahc"
BRANCH="main"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

ARCHIVE_URL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading ${REPO}@${BRANCH}..."
curl -sL "$ARCHIVE_URL" | tar -xz -C "$TMPDIR"

# Find extracted directory (e.g. animal-health-main)
EXTRACTED=$(ls "$TMPDIR")
SRC="$TMPDIR/$EXTRACTED/content"

IFS=',' read -ra LANG_ARRAY <<< "$LANGS"

for lang in "${LANG_ARRAY[@]}"; do
  lang=$(echo "$lang" | tr -d ' ')

  # Copy book content JSON files
  content_src="$SRC/$lang/$BOOK"
  content_dst="$PROJECT_DIR/src/data/content/$lang/$BOOK"
  if [ -d "$content_src" ]; then
    echo "Copying content: $lang/$BOOK"
    mkdir -p "$content_dst"
    cp -r "$content_src"/* "$content_dst/"
  else
    echo "Warning: No content found at $content_src"
  fi

  # Copy pictures
  pics_src="$SRC/pictures/$lang/$BOOK"
  pics_dst="$PROJECT_DIR/pictures-src/$lang/$BOOK"
  if [ -d "$pics_src" ]; then
    echo "Copying pictures: $lang/$BOOK"
    mkdir -p "$pics_dst"
    cp -r "$pics_src"/* "$pics_dst/"
  else
    echo "Warning: No pictures found at $pics_src"
  fi
done

echo "Done. Content fetched into:"
echo "  src/data/content/"
echo "  pictures-src/"
