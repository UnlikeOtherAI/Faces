import CoreML
import CoreGraphics

final class FaceEmbedder {
    #if SWIFT_PACKAGE
    private static let resourceBundle = Bundle.module
    #else
    private static let resourceBundle = Bundle(for: FaceEmbedder.self)
    #endif
    private var model: MLModel?

    init() { loadModel() }

    private func loadModel() {
        let bundle = FaceEmbedder.resourceBundle
        let url = bundle.url(forResource: "MobileFaceNet", withExtension: "mlmodelc")
            ?? bundle.url(forResource: "MobileFaceNet", withExtension: "mlpackage")
        guard let url else { return }
        model = try? MLModel(contentsOf: url)
    }

    func embed(image: CGImage) throws -> [Float] {
        guard let model else { throw FacesKitError.modelNotFound }
        var pixelBuffer: CVPixelBuffer?
        CVPixelBufferCreate(nil, 112, 112, kCVPixelFormatType_32BGRA, nil, &pixelBuffer)
        guard let pb = pixelBuffer else { throw FacesKitError.embeddingFailed }
        CVPixelBufferLockBaseAddress(pb, [])
        let ctx = CGContext(
            data: CVPixelBufferGetBaseAddress(pb),
            width: 112, height: 112,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
        ctx?.draw(image, in: CGRect(x: 0, y: 0, width: 112, height: 112))
        CVPixelBufferUnlockBaseAddress(pb, [])
        let input = try MLDictionaryFeatureProvider(dictionary: ["input_1": pb])
        let output = try model.prediction(from: input)
        guard let arr = output.featureValue(for: "output")?.multiArrayValue else {
            throw FacesKitError.embeddingFailed
        }
        return (0..<128).map { Float(truncating: arr[$0]) }
    }
}
