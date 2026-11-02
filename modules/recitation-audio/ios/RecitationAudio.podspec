Pod::Spec.new do |s|
  s.name           = 'RecitationAudio'
  s.version        = '1.0.0'
  s.summary        = 'Microphone audio as 16 kHz PCM, for checking recitation on the device'
  s.description    = 'Streams the microphone as 16 kHz mono 16-bit PCM to JavaScript for speech recognition.'
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
