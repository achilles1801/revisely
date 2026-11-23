# Recite on the phone (Revisely Dev only: plugins/withDevModules links modules-dev/ into Dev's builds alone, so the
# store app's fingerprints never see it). ONNX Runtime comes from ReviselyOnnxRuntime.podspec.json beside this file.
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
  }

  s.source_files = '*.{h,hpp,m,mm,cpp,swift}'
  # Swift sees RECBench.h only; the C++ header stays out of the module's umbrella header.
  s.public_header_files = 'RECBench.h'
  s.private_header_files = 'RECBenchCore.hpp'
end
