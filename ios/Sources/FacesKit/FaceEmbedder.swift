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

        // Render CGImage into 112×112 RGBA byte buffer
        let w = 112, h = 112
        var pixels = [UInt8](repeating: 0, count: w * h * 4)
        guard let ctx = CGContext(
            data: &pixels, width: w, height: h,
            bitsPerComponent: 8, bytesPerRow: w * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        ) else { throw FacesKitError.embeddingFailed }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))

        // Build MLMultiArray [1, 3, 112, 112] with pixels normalised to [-1, 1]
        let arr = try MLMultiArray(shape: [1, 3, 112, 112] as [NSNumber], dataType: .float32)
        let ptr = arr.dataPointer.bindMemory(to: Float.self, capacity: 3 * w * h)
        for y in 0..<h {
            for x in 0..<w {
                let px = (y * w + x) * 4
                ptr[0 * w * h + y * w + x] = Float(pixels[px])     / 127.5 - 1.0  // R
                ptr[1 * w * h + y * w + x] = Float(pixels[px + 1]) / 127.5 - 1.0  // G
                ptr[2 * w * h + y * w + x] = Float(pixels[px + 2]) / 127.5 - 1.0  // B
            }
        }

        let input = try MLDictionaryFeatureProvider(dictionary: ["input": arr])
        let output = try model.prediction(from: input)
        guard let emb = output.featureValue(for: "embedding")?.multiArrayValue else {
            throw FacesKitError.embeddingFailed
        }
        return (0..<emb.count).map { Float(truncating: emb[$0]) }
    }
}
