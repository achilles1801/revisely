Pod::Spec.new do |s|
  s.name           = 'InstallSource'
  s.version        = '1.0.0'
  s.summary        = 'Whether the app was installed from TestFlight'
  s.description    = 'Tells a TestFlight install from an App Store one, so TestFlight can take updates from the preview channel.'
  s.author         = 'Revisely'
  s.homepage       = 'https://revisely.app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,mm,swift}'
end
