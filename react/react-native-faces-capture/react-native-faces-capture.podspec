require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "react-native-faces-capture"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.license      = package["license"]
  s.homepage     = "https://github.com/UnlikeOtherAI/Faces"
  s.authors      = { "UnlikeOtherAI" => "dev@unlikeother.ai" }
  s.source       = { :git => "", :tag => "#{s.version}" }
  s.source_files = "ios/**/*.{h,m,mm,swift}"
  s.swift_version = "5.9"
  s.ios.deployment_target = "16.0"

  s.dependency "React-Core"
  s.dependency "FacesCaptureKit"
end
