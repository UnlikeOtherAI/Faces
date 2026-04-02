import Foundation
import AVFoundation
import CoreImage
import ImageIO

@available(macOS 10.15, *)
public final class FacesKit: NSObject {
    public static let shared = FacesKit()

    public var threshold: Float = 0.60
    public var requiredStreak: Int = 3
    public var captureUnknownFaces: Bool = false
    public var unknownFaceStreak: Int = 3
    public var onMatch: ((MatchResult) -> Void)?
    public var onAllScores: (([MatchResult]) -> Void)?
    public var onFaceRect: ((CGRect, String?) -> Void)?
    public var onUnknownFace: ((Worker) -> Void)?

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
    private var unknownStreakCount: Int = 0
    private var unknownCrops: [CGImage] = []
    private var unknownEmbeddings: [[Float]] = []
    private var unknownCooldownFrames: Int = 0
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

    /// Processes `photos` and returns one L2-normalised embedding vector per photo
    /// in which a face was detected. Photos where no face is found are silently skipped.
    /// The result contains the vectors only — nothing is written to the store.
    public func embeddings(from photos: [CGImage],
                           completion: @escaping (Result<[[Float]], Error>) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async { [self] in
            var vectors: [[Float]] = []
            for photo in photos {
                guard let crop = try? self.detector.detectAndCrop(image: photo) else { continue }
                guard var emb = try? self.embedder.embed(image: crop) else { continue }
                l2Normalize(&emb)
                vectors.append(emb)
            }
            guard !vectors.isEmpty else {
                DispatchQueue.main.async { completion(.failure(FacesKitError.noFaceDetected)) }
                return
            }
            DispatchQueue.main.async { completion(.success(vectors)) }
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
                unknownStreakCount = 0; unknownCrops = []; unknownEmbeddings = []
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
                unknownStreakCount = 0; unknownCrops = []; unknownEmbeddings = []
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
                guard captureUnknownFaces else { return }
                if unknownCooldownFrames > 0 { unknownCooldownFrames -= 1; return }
                unknownStreakCount += 1
                unknownCrops.append(crop)
                unknownEmbeddings.append(emb)
                guard unknownStreakCount >= unknownFaceStreak else { return }
                let cropsToSave = unknownCrops
                let embsToSave = unknownEmbeddings
                unknownStreakCount = 0; unknownCrops = []; unknownEmbeddings = []
                unknownCooldownFrames = 50
                saveAsUnknown(crops: cropsToSave, embeddings: embsToSave)
            }
        }
    }

    private func saveAsUnknown(crops: [CGImage], embeddings: [[Float]]) {
        let id = "unknown_\(Int(Date().timeIntervalSince1970 * 1000))"
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!.appendingPathComponent("FacesKit/unknown")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let photoURL = dir.appendingPathComponent("\(id).jpg")
        saveJPEG(crops[0], to: photoURL)
        let worker = Worker(id: id, name: "Unknown", embeddings: embeddings, photoPath: photoURL.path)
        try? store.save(worker)
        DispatchQueue.main.async { [self] in onUnknownFace?(worker) }
    }

    private func saveJPEG(_ image: CGImage, to url: URL) {
        guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.jpeg" as CFString, 1, nil)
        else { return }
        CGImageDestinationAddImage(dest, image, nil)
        CGImageDestinationFinalize(dest)
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
