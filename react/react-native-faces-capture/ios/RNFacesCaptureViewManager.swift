import Foundation

@objc(RNFacesCaptureViewManager)
class RNFacesCaptureViewManager: RCTViewManager {
    override func view() -> UIView! {
        RNFacesCaptureView()
    }

    override static func requiresMainQueueSetup() -> Bool { true }
}
