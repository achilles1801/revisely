# Recite on the phone (Revisely Dev only: plugins/withDevModules links modules-dev/ into Dev's builds alone, so the
# store app's fingerprints never see it). ONNX Runtime comes from ReviselyOnnxRuntime.podspec.json beside this file.
#
# The engine (recite-core) is private: core/fetch.js brings its compiled xcframework into ios/core-bin/ when the build
# holds RECITE_CORE_TOKEN, checked against core/recite-core.lock, and otherwise puts a stub there, which the pod compiles
# (the app then uses the server path). core-bin/ is gitignored and left out of the fingerprint.
require 'json'

core_out = File.join(__dir__, 'core-bin')
core_result = IO.popen(['node', File.expand_path('../core/fetch.js', __dir__), 'ios', core_out], &:read)
raise 'recite-core: core/fetch.js failed (its message is above)' unless $?.success?
core = JSON.parse(core_result)

Pod::Spec.new do |s|
  s.name           = 'ReciteEngine'
  s.version        = '0.1.0'
  s.summary        = 'Recite on the phone: ONNX Runtime and the on-device bench'
  s.description    = 'Runs the recitation model with ONNX Runtime on the device (Revisely Dev), starting with a bench.'
  s.author         = 'Revisely'
  s.homepage       = 'https://revisely.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'ReviselyOnnxRuntime', '1.31.1'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++20',
    'GCC_ENABLE_CPP_EXCEPTIONS' => 'YES',
    'HEADER_SEARCH_PATHS' => '$(inherited) "$(PODS_TARGET_SRCROOT)/core-bin/include" "$(PODS_TARGET_SRCROOT)/core-bin/glue"',
  }

  sources = ['*.{h,hpp,m,mm,cpp,swift}', 'core-bin/glue/*.c']
  if core['mode'] == 'engine'
    s.vendored_frameworks = 'core-bin/ReciteCore.xcframework'
  else
    sources << 'core-bin/stub/*.c'
  end
  s.source_files = sources
  # Swift sees RECBench.h and RECCore.h only; the C++ header stays out of the module's umbrella header.
  s.public_header_files = ['RECBench.h', 'RECCore.h']
  s.private_header_files = 'RECBenchCore.hpp'
end
