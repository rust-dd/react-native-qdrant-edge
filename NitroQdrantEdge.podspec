require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "NitroQdrantEdge"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.homepage     = package["homepage"]
  s.license      = package["license"]
  s.authors      = package["author"]

  s.platforms    = { :ios => min_ios_version_supported, :visionos => 1.0 }
  s.source       = { :git => package["repository"]["url"], :tag => "#{s.version}" }

  s.source_files = [
    # Implementation (Swift)
    "ios/**/*.{swift}",
    # Autolinking/Registration (Objective-C++)
    "ios/**/*.{m,mm}",
    # Implementation (C++ objects)
    "cpp/**/*.{hpp,cpp,h}",
  ]

  # Rust static libraries
  s.preserve_paths = "ios/Libs/**"
  s.vendored_libraries = "ios/Libs/libqdrant_edge_ffi-ios.a"

  # Simulator uses a different fat lib
  s.pod_target_xcconfig = {
    "OTHER_LDFLAGS[config=Debug][sdk=iphonesimulator*]" => "-force_load $(PODS_TARGET_SRCROOT)/ios/Libs/libqdrant_edge_ffi-ios-sim.a",
    "OTHER_LDFLAGS[config=Debug][sdk=iphoneos*]" => "-force_load $(PODS_TARGET_SRCROOT)/ios/Libs/libqdrant_edge_ffi-ios.a",
    "OTHER_LDFLAGS[config=Release][sdk=iphonesimulator*]" => "-force_load $(PODS_TARGET_SRCROOT)/ios/Libs/libqdrant_edge_ffi-ios-sim.a",
    "OTHER_LDFLAGS[config=Release][sdk=iphoneos*]" => "-force_load $(PODS_TARGET_SRCROOT)/ios/Libs/libqdrant_edge_ffi-ios.a",
    "HEADER_SEARCH_PATHS" => "$(PODS_TARGET_SRCROOT)/cpp",
  }

  # Build Rust libs automatically if not present
  s.script_phase = {
    :name => "Build Rust Library",
    :script => 'if [ ! -f "${PODS_TARGET_SRCROOT}/ios/Libs/libqdrant_edge_ffi-ios.a" ]; then echo "Building Rust library for iOS..."; bash "${PODS_TARGET_SRCROOT}/scripts/build-ios.sh"; fi',
    :execution_position => :before_compile,
  }

  load 'nitrogen/generated/ios/NitroQdrantEdge+autolinking.rb'
  add_nitrogen_files(s)

  s.dependency 'React-jsi'
  s.dependency 'React-callinvoker'
  install_modules_dependencies(s)
end
