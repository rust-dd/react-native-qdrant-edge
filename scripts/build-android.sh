#!/bin/bash
set -euo pipefail

# Build qdrant-edge-ffi for Android targets.
#
# Requirements:
#   cargo install cargo-ndk
#   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
#   ANDROID_NDK_HOME must be set

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$SCRIPT_DIR/../rust/qdrant-edge-ffi"
OUT_DIR="$SCRIPT_DIR/../android/src/main/jniLibs"

# Android ABI -> Rust target mapping
declare -A ABI_MAP=(
  ["arm64-v8a"]="aarch64-linux-android"
  ["armeabi-v7a"]="armv7-linux-androideabi"
  ["x86_64"]="x86_64-linux-android"
  ["x86"]="i686-linux-android"
)

echo "==> Building qdrant-edge-ffi for Android..."

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  echo "ERROR: ANDROID_NDK_HOME is not set"
  exit 1
fi

# Ensure cargo-ndk is installed
if ! command -v cargo-ndk &>/dev/null; then
  echo "  -> Installing cargo-ndk..."
  cargo install cargo-ndk
fi

# Ensure targets are installed
for target in "${ABI_MAP[@]}"; do
  rustup target add "$target" 2>/dev/null || true
done

# Build for each ABI
for abi in "${!ABI_MAP[@]}"; do
  target="${ABI_MAP[$abi]}"
  echo "  -> Building $abi ($target)..."
  cargo ndk \
    --manifest-path "$RUST_DIR/Cargo.toml" \
    --target "$target" \
    --platform 24 \
    -- build --release

  mkdir -p "$OUT_DIR/$abi"
  cp "$RUST_DIR/target/$target/release/libqdrant_edge_ffi.a" "$OUT_DIR/$abi/"
done

echo "==> Android build complete!"
for abi in "${!ABI_MAP[@]}"; do
  echo "    $abi: $OUT_DIR/$abi/libqdrant_edge_ffi.a"
done
