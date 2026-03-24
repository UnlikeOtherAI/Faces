import Foundation
import AVFoundation
import CoreImage

@available(macOS 10.15, *)
public final class FacesKit: NSObject {
    public static let shared = FacesKit()

    public var threshold: Float = 0.60
    public var requiredStreak: Int = 3
    public var onMatch: ((MatchResult) -> Void)?
    public var onAllScores: (([MatchResult]) -> Void)?
    public var onFaceRect: ((CGRect, String?) -> Void)?

    private let camera = CameraEngine()
    public var captureSession: AVCaptureSession { camera.session }
    private let detector = FaceDetector()
    private let embedder = FaceEmbedder()
    private let matcher = FaceMatcher()
    public let store = WorkerStore()

    private var frameCounter = 0
    private let processEveryNthFrame = 3
    private var streakWorkerId: String?
    private var streakCount: Int = 0
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

            // Get face rect for overlay (before crop)
            let faceRect = try? detector.detectNormalized(image: image)

            guard let crop = try? detector.detectAndCrop(image: image) else {
                if self.onFaceRect != nil {
                    DispatchQueue.main.async { self.onFaceRect?(CGRect.zero, nil) }
                }
                if self.onAllScores != nil {
                    let workers = store.all()
                    let zeros = workers.map { MatchResult(worker: $0, score: 0, latencyMs: 0) }
                    DispatchQueue.main.async { self.onAllScores?(zeros) }
                }
                return
            }
            guard var emb = try? embedder.embed(image: crop) else { return }
            l2Normalize(&emb)
            let workers = store.all()
            let latency = Date().timeIntervalSince(start) * 1000

            if self.onAllScores != nil {
                let all = self.matcher.allScores(embedding: emb, workers: workers)
                    .map { MatchResult(worker: $0.worker, score: $0.score, latencyMs: latency) }
                DispatchQueue.main.async { self.onAllScores?(all) }
            }

            let bestResult = matcher.bestMatch(embedding: emb, workers: workers, threshold: threshold)

            if let rect = faceRect, self.onFaceRect != nil {
                DispatchQueue.main.async { self.onFaceRect?(rect, bestResult?.worker.name) }
            }

            if let result = bestResult {
                if result.worker.id == streakWorkerId {
                    streakCount += 1
                } else {
                    streakWorkerId = result.worker.id
                    streakCount = 1
                }
                guard streakCount >= requiredStreak else { return }
                let match = MatchResult(worker: result.worker, score: result.score, latencyMs: latency)
                DispatchQueue.main.async { self.onMatch?(match) }
            } else {
                streakWorkerId = nil
                streakCount = 0
            }
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
