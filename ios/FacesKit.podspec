Pod::Spec.new do |s|
  s.name         = "FacesKit"
  s.version      = "0.1.0"
  s.summary      = "Face identification SDK for iOS"
  s.license      = { :type => "MIT" }
  s.homepage     = "https://github.com/UnlikeOtherAI/Faces"
  s.authors      = { "UnlikeOtherAI" => "dev@unlikeother.ai" }
  s.source       = { :git => "", :tag => "#{s.version}" }
  s.swift_version = "5.9"
  s.ios.deployment_target = "16.0"

  s.source_files  = "Sources/FacesKit/**/*.swift"
  s.resources     = ["Sources/FacesKit/Resources/MobileFaceNet.mlpackage",
                     "Sources/FacesKit/Resources/placeholder.json"]

  s.frameworks    = "CoreML", "Vision", "AVFoundation"
end
