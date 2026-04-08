#!/usr/bin/env bash
# Build self-contained BeeHive binaries for all platforms using bun build --compile.
# Run on Linux (GitHub Actions) — Bun can cross-compile all 5 targets from Linux.
#
# Usage: ./scripts/build-binaries.sh [patch|minor|major]
#   Defaults to current version in package.json.

set -e

PLATFORMS=(
  "bun-linux-x64"
  "bun-linux-arm64"
  "bun-darwin-x64"
  "bun-darwin-arm64"
  "bun-windows-x64"
)

# NOTE: TypeScript must already be compiled (dist/ must exist).
# In GitHub Actions, `npm run build` runs before this script.
# For local use: run `npm run build` first, then this script.

# Clean binaries output
rm -rf binaries
mkdir -p binaries

for PLATFORM in "${PLATFORMS[@]}"; do
  echo "Compiling for $PLATFORM..."
  mkdir -p "binaries/$PLATFORM"

  if [[ "$PLATFORM" == *"windows"* ]]; then
    OUTFILE="binaries/$PLATFORM/beehive.exe"
  else
    OUTFILE="binaries/$PLATFORM/beehive"
  fi

  bun build \
    --compile \
    --target="$PLATFORM" \
    --outfile="$OUTFILE" \
    src/bun/cli.ts

  echo "  -> $OUTFILE"
done

# Package archives
VERSION=$(node -e "console.log(require('./package.json').version)")
echo "Packaging v$VERSION archives..."

mkdir -p dist-release

for PLATFORM in "${PLATFORMS[@]}"; do
  ARCHIVE_NAME="beehive-v${VERSION}-${PLATFORM}"

  if [[ "$PLATFORM" == *"windows"* ]]; then
    # Windows: zip
    cd "binaries/$PLATFORM"
    zip -q "../../dist-release/${ARCHIVE_NAME}.zip" beehive.exe
    cd ../..
    echo "  -> dist-release/${ARCHIVE_NAME}.zip"
  else
    # Unix: tar.gz, wrap in a beehive/ dir for PATH-friendly extraction
    cd binaries
    mv "$PLATFORM" beehive
    tar -czf "../dist-release/${ARCHIVE_NAME}.tar.gz" beehive
    mv beehive "$PLATFORM"
    cd ..
    echo "  -> dist-release/${ARCHIVE_NAME}.tar.gz"
  fi
done

echo ""
echo "Done. Binaries in dist-release/:"
ls dist-release/
