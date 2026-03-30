import Foundation
import CoreGraphics

public enum CapturePose: String, CaseIterable, Codable {
    case leftTop = "left_top"
    case top = "top"
    case topRight = "top_right"
    case bottomRight = "bottom_right"
    case bottomLeft = "bottom_left"
    case straight = "straight"
}

public enum CaptureBlockReason: String, Codable {
    case none
    case noFace = "no_face"
    case multipleFaces = "multiple_faces"
    case outOfFrame = "out_of_frame"
    case wrongPose = "wrong_pose"
    case badLighting = "bad_lighting"
    case tooBlurry = "too_blurry"
    case holdStill = "hold_still"
    case notImplemented = "not_implemented"
}

public struct FaceRect: Codable, Equatable {
    public let x: CGFloat
    public let y: CGFloat
    public let width: CGFloat
    public let height: CGFloat

    public init(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) {
        self.x = x
        self.y = y
        self.width = width
        self.height = height
    }
}

public struct CaptureState: Codable, Equatable {
    public let targetPose: CapturePose
    public let detectedPose: CapturePose?
    public let faceRect: FaceRect?
    public let faceInsideGuide: Bool
    public let lightingOk: Bool
    public let sharpnessOk: Bool
    public let stable: Bool
    public let canCapture: Bool
    public let blockReason: CaptureBlockReason

    public init(
        targetPose: CapturePose,
        detectedPose: CapturePose? = nil,
        faceRect: FaceRect? = nil,
        faceInsideGuide: Bool = false,
        lightingOk: Bool = false,
        sharpnessOk: Bool = false,
        stable: Bool = false,
        canCapture: Bool = false,
        blockReason: CaptureBlockReason = .notImplemented
    ) {
        self.targetPose = targetPose
        self.detectedPose = detectedPose
        self.faceRect = faceRect
        self.faceInsideGuide = faceInsideGuide
        self.lightingOk = lightingOk
        self.sharpnessOk = sharpnessOk
        self.stable = stable
        self.canCapture = canCapture
        self.blockReason = blockReason
    }
}

public enum FacesCaptureError: Error, LocalizedError {
    case captureNotReady
    case noFrameAvailable

    public var errorDescription: String? {
        switch self {
        case .captureNotReady:
            return "Capture is not ready for the requested pose."
        case .noFrameAvailable:
            return "No camera frame is available yet."
        }
    }
}
