Pod::Spec.new do |s|
  s.name           = 'NowPlayingCommands'
  s.version        = '1.0.0'
  s.summary        = 'Next and previous track on the lock screen'
  s.description    = 'Shows the lock screen and Control Center previous and next buttons for the recitation, and tells JavaScript when they are pressed.'
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
