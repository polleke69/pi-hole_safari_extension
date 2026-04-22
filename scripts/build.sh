#!/usr/bin/env bash
# Build the Safari Web Extension: sync extension/ into the Xcode project, then
# build the "Pi-hole Allowlist" app (embeds the .appex). By default all output
# goes under the *current working directory* (e.g. ./build when you run this
# from the repo root). Override with BUILD_DIR=/path/to/out
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_HINT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Repository root: git when available, else parent of this script
if git -C "$REPO_HINT" rev-parse --show-toplevel &>/dev/null; then
  ROOT="$(git -C "$REPO_HINT" rev-parse --show-toplevel)"
else
  ROOT="$REPO_HINT"
fi

# Where the user launched the command (e.g. repo root) — build artifacts go here
START_PWD="$(pwd)"
BUILD_DIR="${BUILD_DIR:-$START_PWD/build}"

CONFIG="${1:-Release}"
if [[ "$CONFIG" != "Debug" && "$CONFIG" != "Release" ]]; then
  echo "Usage: $0 [Debug|Release]" >&2
  echo "Optional env: BUILD_DIR (default: \$PWD/build), CODE_SIGNING_ALLOWED=NO" >&2
  exit 1
fi

DERIVED="$BUILD_DIR/DerivedData"
OUT_APP="$BUILD_DIR/Pi-hole Allowlist.app"
PROJECT="$ROOT/safari-app/Pi-hole Allowlist/Pi-hole Allowlist.xcodeproj"
SCHEME="Pi-hole Allowlist"

export PATH="/usr/bin:/bin:/usr/sbin:/sbin:${PATH:-}"

if ! command -v npm >/dev/null 2>&1; then
  echo "error: npm not found (install Node.js or add it to PATH)" >&2
  exit 1
fi
if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "error: xcodebuild not found (install Xcode command-line tools)" >&2
  exit 1
fi

cd "$ROOT"
echo "==> Project: $ROOT"
echo "==> Build output: $BUILD_DIR"

echo "==> Sync extension/ into Xcode Resources"
npm run sync:safari

echo "==> xcodebuild ($CONFIG) — DerivedData: $DERIVED"
mkdir -p "$BUILD_DIR"
rm -rf "$OUT_APP"

# For unsigned/CLI-only builds, prefix: CODE_SIGNING_ALLOWED=NO $0
xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration "$CONFIG" \
  -destination "generic/platform=macOS" \
  -derivedDataPath "$DERIVED" \
  build

BUILT="$DERIVED/Build/Products/$CONFIG/Pi-hole Allowlist.app"
if [[ ! -d "$BUILT" ]]; then
  echo "error: expected app not found: $BUILT" >&2
  exit 1
fi

echo "==> Copying app to: $OUT_APP"
cp -R "$BUILT" "$OUT_APP"
echo "Built: $OUT_APP"
