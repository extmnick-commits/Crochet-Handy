#!/usr/bin/env bash
# Refresh iOS native project, install pods, open Xcode workspace.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo "xcodebuild not found. Install Xcode from the App Store and run it once."
  exit 1
fi

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

NEED_PREBUILD=0
if [[ ! -d ios/CrochetHandy.xcworkspace ]]; then
  NEED_PREBUILD=1
fi

if [[ "${1:-}" == "--clean" ]]; then
  echo "Running expo prebuild --clean (recreates ios/)…"
  npx expo prebuild --platform ios --clean
elif [[ "$NEED_PREBUILD" -eq 1 ]]; then
  echo "No ios workspace found; running expo prebuild…"
  npx expo prebuild --platform ios
else
  echo "Syncing native ios/ from app.config (no --clean)…"
  npx expo prebuild --platform ios --no-install
fi

echo "Installing CocoaPods…"
(
  cd ios
  if command -v pod >/dev/null 2>&1; then
    pod install
  else
    echo "CocoaPods not on PATH. Try: sudo gem install cocoapods"
    exit 1
  fi
)

echo ""
echo "Opening Crochet Handy.xcworkspace in Xcode…"
echo "  Standalone on device: Release scheme + your Team, then Run or Product → Archive."
echo "  See docs/LOCAL_IOS_XCODE.md"
open "$ROOT/ios/CrochetHandy.xcworkspace"
