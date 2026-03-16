import Vision
import CoreGraphics

final class FaceDetector {
    private let request = VNDetectFaceRectanglesRequest()

    func detectAndCrop(image: CGImage) throws -> CGImage? {
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        try handler.perform([request])
        guard let obs = request.results?.first else { return nil }
        let w = CGFloat(image.width)
        let h = CGFloat(image.height)
        let box = VNImageRectForNormalizedRect(obs.boundingBox, Int(w), Int(h))
        let flipped = CGRect(x: box.minX, y: h - box.maxY,
                             width: box.width, height: box.height)
        let pad = max(flipped.width, flipped.height) * 0.2
        let padded = flipped.insetBy(dx: -pad, dy: -pad)
            .intersection(CGRect(x: 0, y: 0, width: w, height: h))
        guard let cropped = image.cropping(to: padded) else { return nil }
        let ctx = CGContext(
            data: nil, width: 112, height: 112,
            bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
        ctx?.draw(cropped, in: CGRect(x: 0, y: 0, width: 112, height: 112))
        return ctx?.makeImage()
    }
}
