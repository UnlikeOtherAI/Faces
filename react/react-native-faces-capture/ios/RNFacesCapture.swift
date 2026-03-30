import Foundation
import FacesCaptureKit

@objc(RNFacesCapture)
class RNFacesCapture: RCTEventEmitter {
    override func supportedEvents() -> [String]! {
        ["onCaptureState"]
    }

    override func startObserving() {
        FacesCaptureKit.shared.onCaptureState = { [weak self] state in
            var body: [String: Any] = [
                "targetPose": state.targetPose.rawValue,
                "faceInsideGuide": state.faceInsideGuide,
                "lightingOk": state.lightingOk,
                "sharpnessOk": state.sharpnessOk,
                "stable": state.stable,
                "canCapture": state.canCapture,
                "blockReason": state.blockReason.rawValue,
                "yaw": state.yaw,
                "verticalRatio": state.verticalRatio,
            ]
            if let detectedPose = state.detectedPose {
                body["detectedPose"] = detectedPose.rawValue
            }
            if let rect = state.faceRect {
                body["faceRect"] = [
                    "x": rect.x,
                    "y": rect.y,
                    "width": rect.width,
                    "height": rect.height,
                ]
            }
            self?.sendEvent(withName: "onCaptureState", body: body)
        }
    }

    override func stopObserving() {
        FacesCaptureKit.shared.onCaptureState = nil
    }

    @objc func startGuidedCapture(_ resolve: @escaping RCTPromiseResolveBlock,
                                  rejecter reject: @escaping RCTPromiseRejectBlock) {
        FacesCaptureKit.shared.startGuidedCapture()
        resolve(nil)
    }

    @objc func stopGuidedCapture(_ resolve: @escaping RCTPromiseResolveBlock,
                                 rejecter reject: @escaping RCTPromiseRejectBlock) {
        FacesCaptureKit.shared.stopGuidedCapture()
        resolve(nil)
    }

    @objc func setTargetPose(_ targetPose: String,
                             resolver resolve: @escaping RCTPromiseResolveBlock,
                             rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let pose = CapturePose(rawValue: targetPose) else {
            reject("INVALID_POSE", "Unknown capture pose: \(targetPose)", nil)
            return
        }
        FacesCaptureKit.shared.setTargetPose(pose)
        resolve(nil)
    }

    @objc func capturePhoto(_ targetPose: String,
                            resolver resolve: @escaping RCTPromiseResolveBlock,
                            rejecter reject: @escaping RCTPromiseRejectBlock) {
        guard let pose = CapturePose(rawValue: targetPose) else {
            reject("INVALID_POSE", "Unknown capture pose: \(targetPose)", nil)
            return
        }
        do {
            let uri = try FacesCaptureKit.shared.capturePhoto(targetPose: pose)
            resolve(uri)
        } catch {
            reject("CAPTURE_NOT_IMPLEMENTED", error.localizedDescription, error)
        }
    }
}
