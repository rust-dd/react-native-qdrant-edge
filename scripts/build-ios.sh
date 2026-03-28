#!/bin/bash
set -euo pipefail

# Build qdrant-edge-ffi for iOS targets and create an xcframework-ready fat library.
#
# Requirements:
#   rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$SCRIPT_DIR/../rust/qdrant-edge-ffi"
OUT_DIR="$SCRIPT_DIR/../ios/Libs"
HEADER="$SCRIPT_DIR/../cpp/qdrant_edge_ffi.h"

if command -v cbindgen &>/dev/null; then
  echo "==> Generating C header..."
  cd "$RUST_DIR"
  cbindgen --config cbindgen.toml --crate qdrant-edge-ffi --output "$HEADER"
fi

TARGETS_DEVICE="aarch64-apple-ios"
TARGETS_SIM="aarch64-apple-ios-sim x86_64-apple-ios"

echo "==> Building qdrant-edge-ffi for iOS..."

# Ensure targets are installed
for target in $TARGETS_DEVICE $TARGETS_SIM; do
  rustup target add "$target" 2>/dev/null || true
done

# Build all targets
for target in $TARGETS_DEVICE $TARGETS_SIM; do
  echo "  -> Building $target..."
  cargo build --manifest-path "$RUST_DIR/Cargo.toml" --release --target "$target"
done

# Create output directory
mkdir -p "$OUT_DIR"

# Copy device lib
cp "$RUST_DIR/target/$TARGETS_DEVICE/release/libqdrant_edge_ffi.a" "$OUT_DIR/libqdrant_edge_ffi-ios.a"

# Create fat lib for simulator (arm64 + x86_64)
echo "  -> Creating simulator fat library..."
lipo -create \
  "$RUST_DIR/target/aarch64-apple-ios-sim/release/libqdrant_edge_ffi.a" \
  "$RUST_DIR/target/x86_64-apple-ios/release/libqdrant_edge_ffi.a" \
  -output "$OUT_DIR/libqdrant_edge_ffi-ios-sim.a"

echo "  -> Stripping debug symbols..."
strip -S "$OUT_DIR/libqdrant_edge_ffi-ios.a"
strip -S "$OUT_DIR/libqdrant_edge_ffi-ios-sim.a"

echo "  -> Creating xcframework..."
rm -rf "$OUT_DIR/qdrant_edge_ffi.xcframework"
TMPDIR=$(mktemp -d)
cp "$OUT_DIR/libqdrant_edge_ffi-ios.a" "$TMPDIR/libqdrant_edge_ffi.a"
mkdir -p "$TMPDIR/sim"
cp "$OUT_DIR/libqdrant_edge_ffi-ios-sim.a" "$TMPDIR/sim/libqdrant_edge_ffi.a"
xcodebuild -create-xcframework \
  -library "$TMPDIR/libqdrant_edge_ffi.a" \
  -library "$TMPDIR/sim/libqdrant_edge_ffi.a" \
  -output "$OUT_DIR/qdrant_edge_ffi.xcframework"
rm -rf "$TMPDIR"

echo "==> iOS build complete!"
echo "    $OUT_DIR/qdrant_edge_ffi.xcframework"
