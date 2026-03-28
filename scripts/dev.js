const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const os = require('os')

const ROOT = path.resolve(__dirname, '..')
const EXAMPLE = path.join(ROOT, 'example')
const IOS_XCF = path.join(ROOT, 'ios', 'Libs', 'qdrant_edge_ffi.xcframework')
const ANDROID_LIB = path.join(ROOT, 'android', 'src', 'main', 'jniLibs', 'arm64-v8a', 'libqdrant_edge_ffi.a')

const platform = process.argv[2]
if (!platform || !['ios', 'android', 'both'].includes(platform)) {
  console.log('Usage: node scripts/dev.js <ios|android|both>')
  process.exit(1)
}

function run(cmd, cwd = ROOT) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { stdio: 'inherit', cwd })
}

function step(label) {
  console.log(`\n${'='.repeat(60)}\n  ${label}\n${'='.repeat(60)}`)
}

const buildIos = platform === 'ios' || platform === 'both'
const buildAndroid = platform === 'android' || platform === 'both'

// 1. Rust
if (buildIos && !fs.existsSync(IOS_XCF)) {
  step('Building Rust for iOS')
  run('bash scripts/build-ios.sh')
} else if (buildIos) {
  console.log('\n  iOS xcframework exists, skipping Rust build.')
}

if (buildAndroid && !fs.existsSync(ANDROID_LIB)) {
  step('Building Rust for Android')
  run('bash scripts/build-android.sh')
} else if (buildAndroid) {
  console.log('\n  Android jniLibs exist, skipping Rust build.')
}

// 2. TypeScript
step('Building TypeScript')
run('npx tsc')

// 3. Example deps
if (!fs.existsSync(path.join(EXAMPLE, 'node_modules'))) {
  step('Installing example dependencies')
  run('npm install', EXAMPLE)
}

// 4. Prebuild + run
if (buildIos) {
  step('Running iOS')
  run('npx expo run:ios', EXAMPLE)
}

if (buildAndroid) {
  step('Running Android')
  run('npx expo run:android', EXAMPLE)
}
