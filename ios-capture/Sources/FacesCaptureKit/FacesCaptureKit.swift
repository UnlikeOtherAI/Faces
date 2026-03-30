import AVFoundation
import CoreImage
import Foundation
import ImageIO

@available(macOS 10.15, *)
public final class FacesCaptureKit {
    public static let shared = FacesCaptureKit()

    public var onCaptureState: ((CaptureState) -> Void)?
    public var onLandmarks: (([CGPoint]) -> Void)?
    public var captureSession: AVCaptureSession { camera.session }

    private let camera = CameraEngine()
    private let analyzer = FaceAnalyzer()
    private let processingQueue = DispatchQueue(label: "facescapture.processing", qos: .userInitiated)
    private let ciContext = CIContext()
    private var currentTargetPose: CapturePose = .leftTop
    private var latestState = CaptureState(targetPose: .leftTop)
    private var previousRect: FaceRect?
    private var latestBuffer: CVPixelBuffer?
    private var captureReadyBuffer: CVPixelBuffer?

    private init() {
        camera.onFrame = { [weak self] buffer in
            self?.handleFrame(buffer)
        }
    }

    public func startGuidedCapture() {
        camera.start()
        onCaptureState?(latestState)
    }

    public func stopGuidedCapture() {
        camera.stop()
    }

    public func setTargetPose(_ pose: CapturePose) {
        currentTargetPose = pose
        latestState = CaptureState(
            targetPose: pose,
            detectedPose: latestState.detectedPose,
            faceRect: latestState.faceRect,
            faceInsideGuide: latestState.faceInsideGuide,
            lightingOk: latestState.lightingOk,
            sharpnessOk: latestState.sharpnessOk,
            stable: latestState.stable,
            canCapture: latestState.canCapture && latestState.detectedPose == pose,
            blockReason: latestState.detectedPose == pose ? latestState.blockReason : .wrongPose
        )
        DispatchQueue.main.async { [latestState, onCaptureState] in
            onCaptureState?(latestState)
        }
    }

    public func capturePhoto(targetPose: CapturePose) throws -> String {
        guard latestState.canCapture, latestState.targetPose == targetPose else {
            throw FacesCaptureError.captureNotReady
        }
        guard let buffer = captureReadyBuffer ?? latestBuffer else {
            throw FacesCaptureError.noFrameAvailable
        }
        captureReadyBuffer = nil
        let image = CIImage(cvPixelBuffer: buffer).oriented(.right)
        guard let cgImage = ciContext.createCGImage(image, from: image.extent) else {
            throw FacesCaptureError.noFrameAvailable
        }

        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!.appendingPathComponent("FacesCapture/captures")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent(UUID().uuidString + ".jpg")
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.jpeg" as CFString, 1, nil) else {
            throw FacesCaptureError.noFrameAvailable
        }
        CGImageDestinationAddImage(dest, cgImage, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        CGImageDestinationFinalize(dest)
        return "file://" + url.path
    }

    private func handleFrame(_ buffer: CVPixelBuffer) {
        latestBuffer = buffer
        processingQueue.async { [weak self] in
            guard let self else { return }
            let analysis = analyzer.analyze(buffer: buffer, targetPose: currentTargetPose, previousRect: previousRect)
            previousRect = analysis.state.faceRect
            latestState = analysis.state
            if analysis.state.canCapture {
                captureReadyBuffer = buffer
            } else {
                captureReadyBuffer = nil
            }
            let landmarks = analysis.landmarks
            DispatchQueue.main.async { [latestState, onCaptureState, onLandmarks] in
                onCaptureState?(latestState)
                onLandmarks?(landmarks)
            }
        }
    }
}
