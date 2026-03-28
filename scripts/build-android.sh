#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$SCRIPT_DIR/../rust/qdrant-edge-ffi"
OUT_DIR="$SCRIPT_DIR/../android/src/main/jniLibs"
HEADER="$SCRIPT_DIR/../cpp/qdrant_edge_ffi.h"

if command -v cbindgen &>/dev/null; then
  echo "==> Generating C header..."
  cd "$RUST_DIR"
  cbindgen --config cbindgen.toml --crate qdrant-edge-ffi --output "$HEADER"
fi

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  for candidate in \
    "$HOME/Library/Android/sdk/ndk"/*/ \
    "$HOME/Android/Sdk/ndk"/*/ \
    "${ANDROID_HOME:-/nonexistent}/ndk"/*/ \
    "${ANDROID_SDK_ROOT:-/nonexistent}/ndk"/*/; do
    if [ -d "$candidate" ]; then
      ANDROID_NDK_HOME="${candidate%/}"
      break
    fi
  done
fi

if [ -z "${ANDROID_NDK_HOME:-}" ]; then
  echo "ERROR: Cannot find Android NDK. Set ANDROID_NDK_HOME or install NDK via Android Studio."
  exit 1
fi

export ANDROID_NDK_HOME
echo "==> Using NDK: $ANDROID_NDK_HOME"
echo "==> Building qdrant-edge-ffi for Android..."

if ! command -v cargo-ndk &>/dev/null; then
  echo "  -> Installing cargo-ndk..."
  cargo install cargo-ndk
fi

TARGETS="aarch64-linux-android x86_64-linux-android"

for target in $TARGETS; do
  rustup target add "$target" 2>/dev/null || true
done

build_abi() {
  local abi=$1
  local target=$2
  echo "  -> Building $abi ($target)..."
  cd "$RUST_DIR"
  cargo ndk \
    --target "$target" \
    --platform 24 \
    -- build --release
  mkdir -p "$OUT_DIR/$abi"
  cp "$RUST_DIR/target/$target/release/libqdrant_edge_ffi.a" "$OUT_DIR/$abi/"
}

build_abi "arm64-v8a" "aarch64-linux-android"
build_abi "x86_64" "x86_64-linux-android"

echo "  -> Stripping debug symbols..."
strip -S "$OUT_DIR/arm64-v8a/libqdrant_edge_ffi.a" 2>/dev/null || true
strip -S "$OUT_DIR/x86_64/libqdrant_edge_ffi.a" 2>/dev/null || true

echo "==> Android build complete!"
