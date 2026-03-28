const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const IOS_XCF = path.join(ROOT, 'ios', 'Libs', 'qdrant_edge_ffi.xcframework')
const ANDROID_LIB = path.join(
  ROOT,
  'android',
  'src',
  'main',
  'jniLibs',
  'arm64-v8a',
  'libqdrant_edge_ffi.a'
)

function run(cmd) {
  console.log(`> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd: ROOT })
}

console.log('[prepack] Building iOS Rust libraries...')
run('bash scripts/build-ios.sh')

console.log('[prepack] Building Android Rust libraries...')
try {
  run('bash scripts/build-android.sh')
} catch {
  console.warn('[prepack] Android build failed (NDK missing?). Skipping.')
}

console.log('[prepack] Building TypeScript...')
run('npx tsc')

console.log('[prepack] Done.')
