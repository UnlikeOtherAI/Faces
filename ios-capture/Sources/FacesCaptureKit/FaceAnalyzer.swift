import CoreGraphics
import CoreImage
import ImageIO
import Vision

@available(macOS 10.15, *)
struct FaceAnalysis {
    let state: CaptureState
    let landmarks: [CGPoint] // capture device normalized coordinates
}

@available(macOS 10.15, *)
final class FaceAnalyzer {
    private let request = VNDetectFaceLandmarksRequest()

    func analyze(buffer: CVPixelBuffer, targetPose: CapturePose, previousRect: FaceRect?) -> FaceAnalysis {
        let orientation = CGImagePropertyOrientation.leftMirrored
        let handler = VNImageRequestHandler(cvPixelBuffer: buffer, orientation: orientation, options: [:])

        do {
            try handler.perform([request])
        } catch {
            return FaceAnalysis(state: CaptureState(targetPose: targetPose, blockReason: .noFace), landmarks: [])
        }

        guard let faces = request.results, !faces.isEmpty else {
            return FaceAnalysis(state: CaptureState(targetPose: targetPose, blockReason: .noFace), landmarks: [])
        }
        guard faces.count == 1, let face = faces.first else {
            return FaceAnalysis(state: CaptureState(targetPose: targetPose, blockReason: .multipleFaces), landmarks: [])
        }

        let rect = FaceRect(
            x: face.boundingBox.minX,
            y: face.boundingBox.minY,
            width: face.boundingBox.width,
            height: face.boundingBox.height
        )
        let insideGuide = isInsideGuide(rect)
        let lightingOk = lightingScore(buffer) >= 0.25
        let sharpnessOk = sharpnessScore(buffer) >= 0.018
        let poseResult = detectPose(face)
        let detectedPose = poseResult.pose
        let stable = isStable(current: rect, previous: previousRect, detectedPose: detectedPose, targetPose: targetPose)

        let blockReason: CaptureBlockReason
        if !lightingOk {
            blockReason = .badLighting
        } else if !sharpnessOk {
            blockReason = .tooBlurry
        } else if !insideGuide {
            blockReason = .outOfFrame
        } else if detectedPose != targetPose {
            blockReason = .wrongPose
        } else if !stable {
            blockReason = .holdStill
        } else {
            blockReason = .none
        }

        let landmarkPoints = extractLandmarks(face)

        return FaceAnalysis(
            state: CaptureState(
                targetPose: targetPose,
                detectedPose: detectedPose,
                faceRect: rect,
                faceInsideGuide: insideGuide,
                lightingOk: lightingOk,
                sharpnessOk: sharpnessOk,
                stable: stable,
                canCapture: blockReason == .none,
                blockReason: blockReason,
                yaw: poseResult.yaw,
                verticalRatio: poseResult.verticalRatio
            ),
            landmarks: landmarkPoints
        )
    }

    private struct PoseResult {
        let pose: CapturePose
        let yaw: Double
        let verticalRatio: Double
    }

    private func detectPose(_ face: VNFaceObservation) -> PoseResult {
        let yaw = face.yaw?.doubleValue ?? 0
        let landmarks = face.landmarks

        guard
            let leftEye = averagePoint(landmarks?.leftEye),
            let rightEye = averagePoint(landmarks?.rightEye),
            let nose = averagePoint(landmarks?.nose),
            let outerLips = averagePoint(landmarks?.outerLips)
        else {
            let fallback: CapturePose
            if yaw < -0.18 { fallback = .topRight }
            else if yaw > 0.18 { fallback = .leftTop }
            else { fallback = .straight }
            return PoseResult(pose: fallback, yaw: yaw, verticalRatio: 0)
        }

        let eyesMidX = (leftEye.x + rightEye.x) / 2
        let eyeY = (leftEye.y + rightEye.y) / 2
        let mouthY = outerLips.y
        let horizontal = nose.x - eyesMidX
        let verticalRatio = (mouthY - eyeY)

        let vertical: Int
        if verticalRatio < 0.33 {
            vertical = 1
        } else if verticalRatio > 0.38 {
            vertical = -1
        } else {
            vertical = 0
        }

        let horizontalBucket: Int
        if horizontal < -0.02 || yaw > 0.12 {
            horizontalBucket = -1
        } else if horizontal > 0.02 || yaw < -0.12 {
            horizontalBucket = 1
        } else {
            horizontalBucket = 0
        }

        let pose: CapturePose
        switch (horizontalBucket, vertical) {
        case (-1, 1): pose = .leftTop
        case (1, 1): pose = .topRight
        case (1, -1): pose = .bottomRight
        case (-1, -1): pose = .bottomLeft
        case (0, 1): pose = .top
        default: pose = .straight
        }
        return PoseResult(pose: pose, yaw: yaw, verticalRatio: verticalRatio)
    }

    private func averagePoint(_ region: VNFaceLandmarkRegion2D?) -> CGPoint? {
        guard let region, region.pointCount > 0 else { return nil }
        let points = region.normalizedPoints
        let sum = points.reduce(CGPoint.zero) { partial, point in
            CGPoint(x: partial.x + CGFloat(point.x), y: partial.y + CGFloat(point.y))
        }
        return CGPoint(x: sum.x / CGFloat(points.count), y: sum.y / CGFloat(points.count))
    }

    /// Extract key landmark points and convert from Vision .leftMirrored space to capture device coordinates.
    private func extractLandmarks(_ face: VNFaceObservation) -> [CGPoint] {
        guard let lm = face.landmarks else { return [] }
        let bbox = face.boundingBox
        var points: [CGPoint] = []

        func toDevice(_ faceRelative: CGPoint) -> CGPoint {
            let vx = bbox.origin.x + faceRelative.x * bbox.width
            let vy = bbox.origin.y + faceRelative.y * bbox.height
            return CGPoint(x: 1 - vy, y: vx)
        }

        if let p = averagePoint(lm.leftEye) { points.append(toDevice(p)) }
        if let p = averagePoint(lm.rightEye) { points.append(toDevice(p)) }
        if let p = averagePoint(lm.nose) { points.append(toDevice(p)) }

        if let outerLips = lm.outerLips, outerLips.pointCount >= 2 {
            let pts = outerLips.normalizedPoints
            var minPt = pts[0], maxPt = pts[0]
            for i in 1..<outerLips.pointCount {
                if pts[i].x < minPt.x { minPt = pts[i] }
                if pts[i].x > maxPt.x { maxPt = pts[i] }
            }
            points.append(toDevice(CGPoint(x: CGFloat(minPt.x), y: CGFloat(minPt.y))))
            points.append(toDevice(CGPoint(x: CGFloat(maxPt.x), y: CGFloat(maxPt.y))))
        }

        return points
    }

    private func isInsideGuide(_ rect: FaceRect) -> Bool {
        let centerX = rect.x + rect.width / 2
        let centerY = rect.y + rect.height / 2
        return rect.width >= 0.22 &&
            rect.width <= 0.58 &&
            rect.height >= 0.22 &&
            rect.height <= 0.70 &&
            abs(centerX - 0.5) <= 0.18 &&
            abs(centerY - 0.5) <= 0.18
    }

    private func isStable(current: FaceRect,
                          previous: FaceRect?,
                          detectedPose: CapturePose,
                          targetPose: CapturePose) -> Bool {
        guard let previous, detectedPose == targetPose else { return false }
        let dx = abs((current.x + current.width / 2) - (previous.x + previous.width / 2))
        let dy = abs((current.y + current.height / 2) - (previous.y + previous.height / 2))
        let ds = abs(current.width - previous.width)
        return dx < 0.03 && dy < 0.03 && ds < 0.04
    }

    private func lightingScore(_ buffer: CVPixelBuffer) -> Double {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return 0 }
        let width = CVPixelBufferGetWidth(buffer)
        let height = CVPixelBufferGetHeight(buffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        let pixels = base.assumingMemoryBound(to: UInt8.self)
        var total = 0.0
        var count = 0.0
        let step = 16
        for y in Swift.stride(from: 0, to: height, by: step) {
            for x in Swift.stride(from: 0, to: width, by: step) {
                let offset = y * bytesPerRow + x * 4
                let b = Double(pixels[offset])
                let g = Double(pixels[offset + 1])
                let r = Double(pixels[offset + 2])
                total += (0.114 * b + 0.587 * g + 0.299 * r) / 255.0
                count += 1
            }
        }
        return count == 0 ? 0 : total / count
    }

    private func sharpnessScore(_ buffer: CVPixelBuffer) -> Double {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return 0 }
        let width = CVPixelBufferGetWidth(buffer)
        let height = CVPixelBufferGetHeight(buffer)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        let pixels = base.assumingMemoryBound(to: UInt8.self)
        let step = 20
        var total = 0.0
        var count = 0.0
        for y in Swift.stride(from: 0, to: max(0, height - step), by: step) {
            for x in Swift.stride(from: 0, to: max(0, width - step), by: step) {
                let o1 = y * bytesPerRow + x * 4
                let o2 = y * bytesPerRow + (x + step) * 4
                let o3 = (y + step) * bytesPerRow + x * 4
                let l1 = 0.114 * Double(pixels[o1]) + 0.587 * Double(pixels[o1 + 1]) + 0.299 * Double(pixels[o1 + 2])
                let l2 = 0.114 * Double(pixels[o2]) + 0.587 * Double(pixels[o2 + 1]) + 0.299 * Double(pixels[o2 + 2])
                let l3 = 0.114 * Double(pixels[o3]) + 0.587 * Double(pixels[o3 + 1]) + 0.299 * Double(pixels[o3 + 2])
                total += Swift.abs(l1 - l2) + Swift.abs(l1 - l3)
                count += 2
            }
        }
        return count == 0 ? 0 : (total / count) / 255.0
    }
}
