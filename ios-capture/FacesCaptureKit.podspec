Pod::Spec.new do |s|
  s.name         = "FacesCaptureKit"
  s.version      = "0.1.0"
  s.summary      = "Guided face capture SDK for iOS"
  s.license      = { :type => "MIT" }
  s.homepage     = "https://github.com/UnlikeOtherAI/Faces"
  s.authors      = { "UnlikeOtherAI" => "dev@unlikeother.ai" }
  s.source       = { :git => "", :tag => "#{s.version}" }
  s.swift_version = "5.9"
  s.ios.deployment_target = "16.0"

  s.source_files = "Sources/FacesCaptureKit/**/*.swift"
  s.frameworks   = "AVFoundation", "UIKit", "Vision"
end
