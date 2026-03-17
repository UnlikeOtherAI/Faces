import CoreML
import CoreGraphics

final class FaceEmbedder {
    #if SWIFT_PACKAGE
    private static let resourceBundle = Bundle.module
    #else
    private static let resourceBundle = Bundle(for: FaceEmbedder.self)
    #endif
    private var model: MLModel?
    var isModelLoaded: Bool { model != nil }

    init() { loadModel() }

    private func loadModel() {
        let bundle = FaceEmbedder.resourceBundle

        // Try a pre-compiled .mlmodelc in the bundle first (fast path)
        if let url = bundle.url(forResource: "MobileFaceNet", withExtension: "mlmodelc"),
           let m = try? MLModel(contentsOf: url) {
            model = m; return
        }

        // Fall back: compile the .mlpackage at runtime, caching the result
        guard let pkgURL = bundle.url(forResource: "MobileFaceNet", withExtension: "mlpackage") else { return }
        let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)
            .first!.appendingPathComponent("FacesKit")
        let cachedURL = cacheDir.appendingPathComponent("MobileFaceNet.mlmodelc")
        if !FileManager.default.fileExists(atPath: cachedURL.path) {
            guard let compiledURL = try? MLModel.compileModel(at: pkgURL) else { return }
            try? FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
            _ = try? FileManager.default.replaceItemAt(cachedURL, withItemAt: compiledURL)
        }
        model = try? MLModel(contentsOf: cachedURL)
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
