#!/bin/bash
set -euo pipefail

# Build qdrant-edge-ffi for iOS targets and create an xcframework-ready fat library.
#
# Requirements:
#   rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUST_DIR="$SCRIPT_DIR/../rust/qdrant-edge-ffi"
OUT_DIR="$SCRIPT_DIR/../ios/Libs"

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

echo "==> iOS build complete!"
echo "    Device:    $OUT_DIR/libqdrant_edge_ffi-ios.a"
echo "    Simulator: $OUT_DIR/libqdrant_edge_ffi-ios-sim.a"
