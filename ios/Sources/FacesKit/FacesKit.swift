import Foundation
import AVFoundation
import CoreImage

@available(macOS 10.15, *)
public final class FacesKit: NSObject {
    public static let shared = FacesKit()

    public var threshold: Float = 0.70
    public var onMatch: ((MatchResult) -> Void)?
    public var onAllScores: (([MatchResult]) -> Void)?

    private let camera = CameraEngine()
    private let detector = FaceDetector()
    private let embedder = FaceEmbedder()
    private let matcher = FaceMatcher()
    public let store = WorkerStore()

    private var frameCounter = 0
    private let processEveryNthFrame = 3
    private let processingQueue = DispatchQueue(label: "faceskit.processing", qos: .userInitiated)

    private override init() {
        super.init()
        camera.onFrame = { [weak self] buffer in self?.handleFrame(buffer) }
    }

    public func start() { camera.start() }
    public func stop()  { camera.stop() }

    public func register(workerId: String, name: String, photos: [CGImage],
                         photoPath: String? = nil,
                         completion: @escaping (Result<Worker, Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            do {
                var embeddings: [[Float]] = []
                for photo in photos {
                    guard let crop = try? self.detector.detectAndCrop(image: photo) else { continue }
                    var emb = try self.embedder.embed(image: crop)
                    l2Normalize(&emb)
                    embeddings.append(emb)
                }
                guard !embeddings.isEmpty else { throw FacesKitError.noFaceDetected }
                let worker = Worker(id: workerId, name: name, embeddings: embeddings, photoPath: photoPath)
                try self.store.save(worker)
                DispatchQueue.main.async { completion(.success(worker)) }
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    public func delete(workerId: String) throws {
        if let worker = store.all().first(where: { $0.id == workerId }),
           let path = worker.photoPath {
            try? FileManager.default.removeItem(atPath: path)
        }
        try store.delete(workerId: workerId)
    }
    public func workers() -> [Worker] { store.all() }
    public func isModelLoaded() -> Bool { embedder.isModelLoaded }

    private func handleFrame(_ buffer: CVPixelBuffer) {
        frameCounter += 1
        guard frameCounter % processEveryNthFrame == 0 else { return }
        guard let image = cgImage(from: buffer) else { return }
        processingQueue.async { [self] in
            let start = Date()
            guard let crop = try? detector.detectAndCrop(image: image) else { return }
            guard var emb = try? embedder.embed(image: crop) else { return }
            l2Normalize(&emb)
            let workers = store.all()
            let latency = Date().timeIntervalSince(start) * 1000

            if self.onAllScores != nil {
                let all = self.matcher.allScores(embedding: emb, workers: workers)
                    .map { MatchResult(worker: $0.worker, score: $0.score, latencyMs: latency) }
                DispatchQueue.main.async { self.onAllScores?(all) }
            }

            guard let result = matcher.bestMatch(embedding: emb, workers: workers,
                                                  threshold: threshold) else { return }
            let match = MatchResult(worker: result.worker, score: result.score, latencyMs: latency)
            DispatchQueue.main.async { self.onMatch?(match) }
        }
    }

    private func cgImage(from buffer: CVPixelBuffer) -> CGImage? {
        let ciImage = CIImage(cvPixelBuffer: buffer)
        let context = CIContext()
        return context.createCGImage(ciImage, from: ciImage.extent)
    }
}

public enum FacesKitError: Error {
    case noFaceDetected
    case modelNotFound
    case embeddingFailed
}
