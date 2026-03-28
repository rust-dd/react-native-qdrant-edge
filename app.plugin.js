const { withDangerousMod, withPlugins } = require('@expo/config-plugins')
const path = require('path')
const fs = require('fs')

function getPackageRoot() {
  const pkgJson = require.resolve('react-native-qdrant-edge/package.json')
  return path.dirname(pkgJson)
}

function buildRustIfMissing(libPath, buildScriptName, platform) {
  if (fs.existsSync(libPath)) return

  let pkgRoot
  try {
    pkgRoot = getPackageRoot()
  } catch {
    console.warn(`[react-native-qdrant-edge] Could not resolve package root.`)
    return
  }

  const buildScript = path.join(pkgRoot, 'scripts', buildScriptName)
  if (!fs.existsSync(buildScript)) {
    console.warn(
      `[react-native-qdrant-edge] ${platform} Rust libs not found and build script missing.`
    )
    return
  }

  console.log(
    `[react-native-qdrant-edge] ${platform} Rust libraries not found. Building...`
  )
  const { execSync } = require('child_process')
  try {
    execSync(`bash "${buildScript}"`, { stdio: 'inherit', cwd: pkgRoot })
  } catch {
    console.warn(
      `[react-native-qdrant-edge] ${platform} Rust build failed. ` +
        `Run manually: cd node_modules/react-native-qdrant-edge && npm run rust:build:${platform.toLowerCase()}`
    )
  }
}

function withQdrantEdgeIOS(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      let pkgRoot
      try { pkgRoot = getPackageRoot() } catch { return config }
      const libPath = path.join(pkgRoot, 'ios', 'Libs', 'qdrant_edge_ffi.xcframework')
      buildRustIfMissing(libPath, 'build-ios.sh', 'iOS')
      return config
    },
  ])
}

function withQdrantEdgeAndroid(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      let pkgRoot
      try { pkgRoot = getPackageRoot() } catch { return config }
      const libPath = path.join(pkgRoot, 'android', 'src', 'main', 'jniLibs', 'arm64-v8a', 'libqdrant_edge_ffi.a')
      buildRustIfMissing(libPath, 'build-android.sh', 'Android')
      return config
    },
  ])
}

function withQdrantEdge(config) {
  return withPlugins(config, [withQdrantEdgeIOS, withQdrantEdgeAndroid])
}

module.exports = withQdrantEdge
