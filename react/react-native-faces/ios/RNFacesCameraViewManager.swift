import Foundation

@objc(RNFacesCameraViewManager)
class RNFacesCameraViewManager: RCTViewManager {
    override func view() -> UIView! {
        return RNFacesCameraView()
    }

    override static func requiresMainQueueSetup() -> Bool { return true }
}
