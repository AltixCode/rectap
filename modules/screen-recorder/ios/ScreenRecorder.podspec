require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', '..', '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'ScreenRecorder'
  s.version        = package['version'] || '1.0.0'
  s.summary        = 'Drives the ReplayKit broadcast extension and owns the recording library.'
  s.description    = 'The app-side half of the recorder: the system broadcast picker, broadcast status, and moving finished recordings out of the App Group container.'
  s.author         = 'AltixCode'
  s.homepage       = 'https://www.altixcode.com'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule',
  }

  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
