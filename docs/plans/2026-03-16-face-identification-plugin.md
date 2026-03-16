# Face Identification Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cross-platform face identification library (iOS Swift PM + Android AAR + React Native bridge) with three example apps and full E2E test coverage via AppReveal.

**Architecture:** Three independent layers — `ios/FacesKit` (Swift Package), `android/faceskit` (Gradle AAR), `react/react-native-faces` (TurboModule). Each layer delegates to the next; native libraries have zero React Native dependency. See `docs/architecture.md`.

**Tech Stack:** Swift/Vision/CoreML/AVFoundation (iOS), Kotlin/CameraX/MLKit/TFLite (Android), TypeScript/TurboModules (RN bridge), MobileFaceNet 128-dim embeddings, AppReveal for E2E.

---

## Task 1: Model setup

**Files:**
- Create: `models/README.md`
- Create: `scripts/download_models.sh`
- Modify: `.gitignore`

**Step 1: Write model README**

```markdown
# Models

MobileFaceNet (128-dim) is required by both platforms.
Run `scripts/download_models.sh` once after cloning.

Files produced (gitignored):
- `models/mobilefacenet.tflite`   — Android
- `models/MobileFaceNet.mlpackage` — iOS (converted from TFLite)

Source: https://github.com/sirius-ai/MobileFaceNet_TF (TFLite export)
Alternative: https://github.com/deepinsight/insightface (ArcFace TFLite)
```

**Step 2: Write download script**

```bash
#!/usr/bin/env bash
set -euo pipefail

MODELS_DIR="$(cd "$(dirname "$0")/.." && pwd)/models"
mkdir -p "$MODELS_DIR"

TFLITE="$MODELS_DIR/mobilefacenet.tflite"
if [ ! -f "$TFLITE" ]; then
  echo "Downloading MobileFaceNet TFLite..."
  curl -L "https://github.com/sirius-ai/MobileFaceNet_TF/releases/download/v1.0/MobileFaceNet.tflite" \
    -o "$TFLITE"
  echo "Done: $TFLITE"
else
  echo "TFLite model already present."
fi

echo ""
echo "Next: convert to CoreML for iOS."
echo "Run: python3 scripts/convert_to_coreml.py"
```

**Step 3: Add model files to .gitignore**

Add to `.gitignore`:
```
# ML models (download via scripts/download_models.sh)
models/*.tflite
models/*.mlpackage
models/*.mlmodel
```

**Step 4: Commit**
```bash
git add models/README.md scripts/download_models.sh .gitignore
git commit -m "feat: add model download script and gitignore rules"
```

---

## Task 2: CoreML conversion script

**Files:**
- Create: `scripts/convert_to_coreml.py`

**Step 1: Write conversion script**

```python
#!/usr/bin/env python3
"""Convert MobileFaceNet TFLite to CoreML mlpackage for iOS."""
import os, sys

try:
    import coremltools as ct
    import tensorflow as tf
except ImportError:
    sys.exit("pip install coremltools tensorflow")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TFLITE = os.path.join(ROOT, "models", "mobilefacenet.tflite")
OUT = os.path.join(ROOT, "models", "MobileFaceNet.mlpackage")

if not os.path.exists(TFLITE):
    sys.exit(f"Missing: {TFLITE}\nRun scripts/download_models.sh first.")

print("Loading TFLite model...")
interpreter = tf.lite.Interpreter(model_path=TFLITE)
interpreter.allocate_tensors()
inp = interpreter.get_input_details()[0]
print(f"Input shape: {inp['shape']}  dtype: {inp['dtype']}")

print("Converting to CoreML...")
model = ct.convert(
    TFLITE,
    inputs=[ct.ImageType(name="input_1", shape=inp["shape"], scale=1/128.0, bias=[-1,-1,-1])],
    minimum_deployment_target=ct.target.iOS16,
)
model.save(OUT)
print(f"Saved: {OUT}")
```

**Step 2: Commit**
```bash
git add scripts/convert_to_coreml.py
git commit -m "feat: add TFLite→CoreML conversion script"
```

---

## Task 3: iOS Swift Package scaffold

**Files:**
- Create: `ios/Package.swift`
- Create: `ios/Sources/FacesKit/FacesKit.swift`
- Create: `ios/Sources/FacesKit/Models.swift`

**Step 1: Write Package.swift**

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "FacesKit",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "FacesKit", targets: ["FacesKit"]),
    ],
    targets: [
        .target(
            name: "FacesKit",
            path: "Sources/FacesKit",
            resources: [.process("Resources")]
        ),
        .testTarget(
            name: "FacesKitTests",
            dependencies: ["FacesKit"],
            path: "Tests/FacesKitTests"
        ),
    ]
)
```

**Step 2: Write Models.swift — shared data types**

```swift
import Foundation

public struct Worker: Codable, Identifiable, Equatable {
    public let id: String
    public let name: String
    public var embeddings: [[Float]]   // one per registration photo
    public var averageEmbedding: [Float]
    public var lastUpdated: Date

    public init(id: String, name: String, embeddings: [[Float]]) {
        self.id = id
        self.name = name
        self.embeddings = embeddings
        self.averageEmbedding = Self.average(embeddings)
        self.lastUpdated = Date()
    }

    static func average(_ vecs: [[Float]]) -> [Float] {
        guard !vecs.isEmpty else { return [] }
        let dim = vecs[0].count
        var sum = [Float](repeating: 0, count: dim)
        for v in vecs { for i in 0..<dim { sum[i] += v[i] } }
        let n = Float(vecs.count)
        var avg = sum.map { $0 / n }
        l2Normalize(&avg)
        return avg
    }
}

public struct MatchResult {
    public let worker: Worker
    public let score: Float
    public let latencyMs: Double
}

public func l2Normalize(_ v: inout [Float]) {
    let norm = sqrt(v.reduce(0) { $0 + $1 * $1 })
    guard norm > 1e-10 else { return }
    for i in v.indices { v[i] /= norm }
}
```

**Step 3: Write FacesKit.swift — public entry point**

```swift
import Foundation
import AVFoundation

/// Main entry point. Use FacesKit.shared.
public final class FacesKit: NSObject {
    public static let shared = FacesKit()

    public var threshold: Float = 0.70
    public var onMatch: ((MatchResult) -> Void)?

    private let camera = CameraEngine()
    private let detector = FaceDetector()
    private let embedder = FaceEmbedder()
    private let matcher = FaceMatcher()
    public let store = WorkerStore()

    private var frameCounter = 0
    private let processEveryNthFrame = 3

    private override init() {
        super.init()
        camera.onFrame = { [weak self] buffer in self?.handleFrame(buffer) }
    }

    public func start() { camera.start() }
    public func stop()  { camera.stop() }

    public func register(workerId: String, name: String, photos: [CGImage],
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
                guard !embeddings.isEmpty else {
                    throw FacesKitError.noFaceDetected
                }
                let worker = Worker(id: workerId, name: name, embeddings: embeddings)
                try self.store.save(worker)
                DispatchQueue.main.async { completion(.success(worker)) }
            } catch {
                DispatchQueue.main.async { completion(.failure(error)) }
            }
        }
    }

    public func delete(workerId: String) throws { try store.delete(workerId: workerId) }
    public func workers() -> [Worker] { store.all() }

    private func handleFrame(_ buffer: CVPixelBuffer) {
        frameCounter += 1
        guard frameCounter % processEveryNthFrame == 0 else { return }
        let start = Date()
        guard
            let image = cgImage(from: buffer),
            let crop  = try? detector.detectAndCrop(image: image)
        else { return }
        guard var emb = try? embedder.embed(image: crop) else { return }
        l2Normalize(&emb)
        let workers = store.all()
        guard let result = matcher.bestMatch(embedding: emb, workers: workers,
                                              threshold: threshold) else { return }
        let latency = Date().timeIntervalSince(start) * 1000
        let match = MatchResult(worker: result.worker, score: result.score, latencyMs: latency)
        DispatchQueue.main.async { self.onMatch?(match) }
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
```

**Step 4: Commit**
```bash
git add ios/
git commit -m "feat(ios): Swift Package scaffold — FacesKit public API and models"
```

---

## Task 4: iOS CameraEngine

**Files:**
- Create: `ios/Sources/FacesKit/CameraEngine.swift`

**Step 1: Write CameraEngine**

```swift
import AVFoundation
import CoreVideo

final class CameraEngine: NSObject {
    var onFrame: ((CVPixelBuffer) -> Void)?

    private let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "faceskit.camera", qos: .userInteractive)

    func start() {
        queue.async { [self] in
            guard !session.isRunning else { return }
            session.beginConfiguration()
            session.sessionPreset = .vga640x480

            guard
                let device = AVCaptureDevice.default(.builtInWideAngleCamera,
                                                     for: .video, position: .front),
                let input = try? AVCaptureDeviceInput(device: device),
                session.canAddInput(input)
            else { session.commitConfiguration(); return }
            session.addInput(input)

            let output = AVCaptureVideoDataOutput()
            output.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
            ]
            output.alwaysDiscardsLateVideoFrames = true
            output.setSampleBufferDelegate(self, queue: queue)
            guard session.canAddOutput(output) else { session.commitConfiguration(); return }
            session.addOutput(output)

            session.commitConfiguration()
            session.startRunning()
        }
    }

    func stop() {
        queue.async { [self] in
            if session.isRunning { session.stopRunning() }
        }
    }
}

extension CameraEngine: AVCaptureVideoDataOutputSampleBufferDelegate {
    func captureOutput(_ output: AVCaptureOutput,
                       didOutput sampleBuffer: CMSampleBuffer,
                       from connection: AVCaptureConnection) {
        guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
        onFrame?(buffer)
    }
}
```

**Step 2: Commit**
```bash
git add ios/Sources/FacesKit/CameraEngine.swift
git commit -m "feat(ios): AVFoundation camera engine with front-camera frame output"
```

---

## Task 5: iOS FaceDetector

**Files:**
- Create: `ios/Sources/FacesKit/FaceDetector.swift`

**Step 1: Write FaceDetector**

```swift
import Vision
import CoreGraphics
import CoreImage

final class FaceDetector {
    private let request = VNDetectFaceRectanglesRequest()

    /// Returns a 112×112 normalised face crop, or nil if no face found.
    func detectAndCrop(image: CGImage) throws -> CGImage? {
        let handler = VNImageRequestHandler(cgImage: image, options: [:])
        try handler.perform([request])
        guard let obs = request.results?.first else { return nil }

        let w = CGFloat(image.width)
        let h = CGFloat(image.height)
        // Vision coordinates: origin bottom-left, normalised
        let box = VNImageRectForNormalizedRect(obs.boundingBox,
                                               Int(w), Int(h))
        // Flip y
        let flipped = CGRect(x: box.minX,
                             y: h - box.maxY,
                             width: box.width,
                             height: box.height)
        // Pad 20%
        let pad = max(flipped.width, flipped.height) * 0.2
        let padded = flipped.insetBy(dx: -pad, dy: -pad)
            .intersection(CGRect(x: 0, y: 0, width: w, height: h))

        guard let cropped = image.cropping(to: padded) else { return nil }

        // Resize to 112×112
        let size = CGSize(width: 112, height: 112)
        let context = CGContext(
            data: nil, width: 112, height: 112,
            bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue
        )
        context?.draw(cropped, in: CGRect(origin: .zero, size: size))
        return context?.makeImage()
    }
}
```

**Step 2: Commit**
```bash
git add ios/Sources/FacesKit/FaceDetector.swift
git commit -m "feat(ios): Vision face detector with padded 112x112 crop"
```

---

## Task 6: iOS FaceEmbedder (CoreML)

**Files:**
- Create: `ios/Sources/FacesKit/FaceEmbedder.swift`
- Create: `ios/Sources/FacesKit/Resources/` (placeholder — model goes here at build time)

**Step 1: Write FaceEmbedder**

```swift
import CoreML
import CoreGraphics
import Accelerate

final class FaceEmbedder {
    private var model: MLModel?

    init() { loadModel() }

    private func loadModel() {
        // Model is bundled in the package resources as MobileFaceNet.mlpackage
        guard let url = Bundle.module.url(forResource: "MobileFaceNet",
                                          withExtension: "mlpackage") else {
            // Model not yet added — recognition unavailable until model is present
            return
        }
        model = try? MLModel(contentsOf: url)
    }

    /// Returns a 128-dim embedding. Throws FacesKitError.modelNotFound if model missing.
    func embed(image: CGImage) throws -> [Float] {
        guard let model else { throw FacesKitError.modelNotFound }

        // Pixel buffer 112×112 BGRA
        var pixelBuffer: CVPixelBuffer?
        CVPixelBufferCreate(nil, 112, 112,
                            kCVPixelFormatType_32BGRA, nil, &pixelBuffer)
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
        guard let multiArray = output.featureValue(for: "output")?.multiArrayValue else {
            throw FacesKitError.embeddingFailed
        }

        return (0..<128).map { Float(truncating: multiArray[$0]) }
    }
}
```

**Step 2: Commit**
```bash
git add ios/Sources/FacesKit/FaceEmbedder.swift
git commit -m "feat(ios): CoreML face embedder — 128-dim MobileFaceNet"
```

---

## Task 7: iOS FaceMatcher + WorkerStore

**Files:**
- Create: `ios/Sources/FacesKit/FaceMatcher.swift`
- Create: `ios/Sources/FacesKit/WorkerStore.swift`

**Step 1: Write FaceMatcher**

```swift
import Foundation

final class FaceMatcher {
    struct Candidate {
        let worker: Worker
        let score: Float
    }

    func bestMatch(embedding: [Float], workers: [Worker], threshold: Float) -> Candidate? {
        var best: Candidate?
        for worker in workers {
            let score = cosineSimilarity(embedding, worker.averageEmbedding)
            if score > threshold, score > (best?.score ?? -1) {
                best = Candidate(worker: worker, score: score)
            }
        }
        return best
    }

    private func cosineSimilarity(_ a: [Float], _ b: [Float]) -> Float {
        guard a.count == b.count, !a.isEmpty else { return 0 }
        // Both vectors are L2-normalised so cosine = dot product
        return zip(a, b).reduce(0) { $0 + $1.0 * $1.1 }
    }
}
```

**Step 2: Write WorkerStore**

```swift
import Foundation

final class WorkerStore {
    private let fileURL: URL
    private var cache: [String: Worker] = [:]
    private let lock = NSLock()

    init() {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory,
                                           in: .userDomainMask).first!
        fileURL = dir.appendingPathComponent("FacesKit/workers.json")
        try? FileManager.default.createDirectory(at: fileURL.deletingLastPathComponent(),
                                                  withIntermediateDirectories: true)
        load()
    }

    func save(_ worker: Worker) throws {
        lock.lock(); defer { lock.unlock() }
        cache[worker.id] = worker
        try persist()
    }

    func delete(workerId: String) throws {
        lock.lock(); defer { lock.unlock() }
        cache.removeValue(forKey: workerId)
        try persist()
    }

    func all() -> [Worker] {
        lock.lock(); defer { lock.unlock() }
        return Array(cache.values)
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let workers = try? JSONDecoder().decode([Worker].self, from: data) else { return }
        cache = Dictionary(uniqueKeysWithValues: workers.map { ($0.id, $0) })
    }

    private func persist() throws {
        let data = try JSONEncoder().encode(Array(cache.values))
        try data.write(to: fileURL, options: .atomic)
    }
}
```

**Step 3: Commit**
```bash
git add ios/Sources/FacesKit/FaceMatcher.swift ios/Sources/FacesKit/WorkerStore.swift
git commit -m "feat(ios): cosine matcher and thread-safe worker store"
```

---

## Task 8: iOS unit tests

**Files:**
- Create: `ios/Tests/FacesKitTests/FacesKitTests.swift`

**Step 1: Write tests**

```swift
import XCTest
@testable import FacesKit

final class FacesKitTests: XCTestCase {

    func test_l2Normalize_unit_vector() {
        var v: [Float] = [3, 4]
        l2Normalize(&v)
        XCTAssertEqual(v[0], 0.6, accuracy: 1e-5)
        XCTAssertEqual(v[1], 0.8, accuracy: 1e-5)
    }

    func test_worker_average_embedding_is_normalised() {
        let e1: [Float] = [1, 0, 0, 0]
        let e2: [Float] = [0, 1, 0, 0]
        let worker = Worker(id: "w1", name: "Alice", embeddings: [e1, e2])
        let norm = sqrt(worker.averageEmbedding.reduce(0) { $0 + $1 * $1 })
        XCTAssertEqual(norm, 1.0, accuracy: 1e-5)
    }

    func test_matcher_returns_nil_below_threshold() {
        let matcher = FaceMatcher()
        var emb: [Float] = [1, 0, 0, 0]; l2Normalize(&emb)
        let worker = Worker(id: "w1", name: "Alice", embeddings: [[0, 1, 0, 0]])
        let result = matcher.bestMatch(embedding: emb, workers: [worker], threshold: 0.70)
        XCTAssertNil(result)
    }

    func test_matcher_returns_match_above_threshold() {
        let matcher = FaceMatcher()
        var emb: [Float] = [1, 0, 0, 0]; l2Normalize(&emb)
        let worker = Worker(id: "w1", name: "Alice", embeddings: [[1, 0, 0, 0]])
        let result = matcher.bestMatch(embedding: emb, workers: [worker], threshold: 0.70)
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.score ?? 0, 1.0, accuracy: 1e-5)
    }

    func test_worker_store_save_and_retrieve() throws {
        let store = WorkerStore()
        let worker = Worker(id: "test-store", name: "Bob", embeddings: [[1, 0]])
        try store.save(worker)
        let all = store.all()
        XCTAssertTrue(all.contains { $0.id == "test-store" })
        try store.delete(workerId: "test-store")
    }
}
```

**Step 2: Run tests**

```bash
cd ios && swift test
```

Expected: 4 tests pass.

**Step 3: Commit**
```bash
git add ios/Tests/
git commit -m "test(ios): FacesKit unit tests — normalise, match, store"
```

---

## Task 9: Android Gradle library scaffold

**Files:**
- Create: `android/build.gradle.kts`
- Create: `android/settings.gradle.kts`
- Create: `android/src/main/java/ai/unlikeother/faceskit/Models.kt`
- Create: `android/src/main/java/ai/unlikeother/faceskit/FacesKit.kt`

**Step 1: Write settings.gradle.kts**

```kotlin
rootProject.name = "faceskit"
include(":faceskit")
```

**Step 2: Write build.gradle.kts**

```kotlin
plugins {
    id("com.android.library") version "8.2.0"
    kotlin("android") version "1.9.22"
}

android {
    namespace = "ai.unlikeother.faceskit"
    compileSdk = 34
    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        release { isMinifyEnabled = false }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.camera:camera-core:1.3.1")
    implementation("androidx.camera:camera-camera2:1.3.1")
    implementation("androidx.camera:camera-lifecycle:1.3.1")
    implementation("com.google.mlkit:face-detection:16.1.5")
    implementation("org.tensorflow:tensorflow-lite:2.14.0")
    implementation("org.tensorflow:tensorflow-lite-gpu:2.14.0")
    implementation("org.tensorflow:tensorflow-lite-support:0.4.4")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    implementation("com.google.code.gson:gson:2.10.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.7.3")
}
```

**Step 3: Write Models.kt**

```kotlin
package ai.unlikeother.faceskit

import kotlin.math.sqrt

data class Worker(
    val id: String,
    val name: String,
    val embeddings: List<FloatArray>,
    val averageEmbedding: FloatArray,
    val lastUpdated: Long = System.currentTimeMillis()
)

data class MatchResult(
    val worker: Worker,
    val score: Float,
    val latencyMs: Long
)

fun FloatArray.l2Normalize(): FloatArray {
    val norm = sqrt(this.fold(0f) { acc, v -> acc + v * v })
    return if (norm < 1e-10f) this else FloatArray(size) { this[it] / norm }
}

fun averageEmbedding(embeddings: List<FloatArray>): FloatArray {
    if (embeddings.isEmpty()) return FloatArray(0)
    val dim = embeddings[0].size
    val sum = FloatArray(dim)
    for (e in embeddings) for (i in 0 until dim) sum[i] += e[i]
    return FloatArray(dim) { sum[it] / embeddings.size }.l2Normalize()
}
```

**Step 4: Write FacesKit.kt — public entry point**

```kotlin
package ai.unlikeother.faceskit

import android.content.Context
import kotlinx.coroutines.*

object FacesKit {
    var threshold: Float = 0.70f
    var onMatch: ((MatchResult) -> Unit)? = null

    private lateinit var appContext: Context
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())

    private val camera by lazy { CameraEngine(appContext) }
    private val detector by lazy { FaceDetector() }
    private val embedder by lazy { FaceEmbedder(appContext) }
    private val matcher = FaceMatcher()
    lateinit var store: WorkerStore
        private set

    private var frameCounter = 0
    private val processEveryNthFrame = 3

    fun start(context: Context) {
        appContext = context.applicationContext
        store = WorkerStore(appContext)
        camera.onFrame = { bitmap ->
            frameCounter++
            if (frameCounter % processEveryNthFrame == 0) {
                scope.launch { handleFrame(bitmap) }
            }
        }
        camera.start()
    }

    fun stop() { camera.stop() }

    fun register(workerId: String, name: String, photos: List<android.graphics.Bitmap>,
                 callback: (Result<Worker>) -> Unit) {
        scope.launch {
            try {
                val embeddings = photos.mapNotNull { photo ->
                    detector.detectAndCrop(photo)?.let { crop ->
                        embedder.embed(crop).l2Normalize()
                    }
                }
                require(embeddings.isNotEmpty()) { "No face detected in provided photos" }
                val worker = Worker(
                    id = workerId, name = name,
                    embeddings = embeddings,
                    averageEmbedding = averageEmbedding(embeddings)
                )
                store.save(worker)
                withContext(Dispatchers.Main) { callback(Result.success(worker)) }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) { callback(Result.failure(e)) }
            }
        }
    }

    fun delete(workerId: String) { store.delete(workerId) }
    fun workers(): List<Worker> = store.all()

    private suspend fun handleFrame(bitmap: android.graphics.Bitmap) {
        val start = System.currentTimeMillis()
        val crop = detector.detectAndCrop(bitmap) ?: return
        val emb = embedder.embed(crop).l2Normalize()
        val workers = store.all()
        val result = matcher.bestMatch(emb, workers, threshold) ?: return
        val latency = System.currentTimeMillis() - start
        val match = MatchResult(result.worker, result.score, latency)
        withContext(Dispatchers.Main) { onMatch?.invoke(match) }
    }
}
```

**Step 5: Commit**
```bash
git add android/
git commit -m "feat(android): Gradle library scaffold — FacesKit public API and models"
```

---

## Task 10: Android CameraEngine

**Files:**
- Create: `android/src/main/java/ai/unlikeother/faceskit/CameraEngine.kt`

**Step 1: Write CameraEngine**

```kotlin
package ai.unlikeother.faceskit

import android.content.Context
import android.graphics.Bitmap
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

internal class CameraEngine(private val context: Context) {
    var onFrame: ((Bitmap) -> Unit)? = null
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()

    fun start() {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            val provider = future.get()
            val analysis = ImageAnalysis.Builder()
                .setTargetResolution(android.util.Size(640, 480))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(executor) { imageProxy ->
                val bitmap = imageProxy.toBitmap()
                imageProxy.close()
                onFrame?.invoke(bitmap)
            }
            val selector = CameraSelector.DEFAULT_FRONT_CAMERA
            // Requires a LifecycleOwner — in RN context this is provided by the Activity
            try {
                provider.unbindAll()
                provider.bindToLifecycle(
                    context as LifecycleOwner, selector, analysis
                )
            } catch (_: Exception) {}
        }, ContextCompat.getMainExecutor(context))
    }

    fun stop() {
        executor.shutdown()
    }
}
```

**Step 2: Commit**
```bash
git add android/src/main/java/ai/unlikeother/faceskit/CameraEngine.kt
git commit -m "feat(android): CameraX camera engine with front-camera frame output"
```

---

## Task 11: Android FaceDetector + FaceEmbedder

**Files:**
- Create: `android/src/main/java/ai/unlikeother/faceskit/FaceDetector.kt`
- Create: `android/src/main/java/ai/unlikeother/faceskit/FaceEmbedder.kt`

**Step 1: Write FaceDetector**

```kotlin
package ai.unlikeother.faceskit

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.tasks.await

internal class FaceDetector {
    private val options = FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .build()
    private val detector = FaceDetection.getClient(options)

    suspend fun detectAndCrop(bitmap: Bitmap): Bitmap? {
        val image = InputImage.fromBitmap(bitmap, 0)
        val faces = detector.process(image).await()
        val face = faces.firstOrNull() ?: return null
        val box = paddedBox(face.boundingBox, bitmap.width, bitmap.height, 0.20f)
        val crop = Bitmap.createBitmap(bitmap, box.left, box.top, box.width(), box.height())
        return Bitmap.createScaledBitmap(crop, 112, 112, true)
    }

    private fun paddedBox(rect: Rect, w: Int, h: Int, pad: Float): Rect {
        val p = (maxOf(rect.width(), rect.height()) * pad).toInt()
        return Rect(
            maxOf(0, rect.left - p), maxOf(0, rect.top - p),
            minOf(w, rect.right + p), minOf(h, rect.bottom + p)
        )
    }
}
```

**Step 2: Write FaceEmbedder**

```kotlin
package ai.unlikeother.faceskit

import android.content.Context
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel

internal class FaceEmbedder(context: Context) {
    private val interpreter: Interpreter

    init {
        val assetFd = context.assets.openFd("mobilefacenet.tflite")
        val inputStream = FileInputStream(assetFd.fileDescriptor)
        val buffer = inputStream.channel.map(
            FileChannel.MapMode.READ_ONLY, assetFd.startOffset, assetFd.declaredLength
        )
        val options = Interpreter.Options().apply {
            try { addDelegate(GpuDelegate()) } catch (_: Exception) { /* CPU fallback */ }
            numThreads = 2
        }
        interpreter = Interpreter(buffer, options)
    }

    fun embed(bitmap: Bitmap): FloatArray {
        val input = bitmapToBuffer(bitmap)
        val output = Array(1) { FloatArray(128) }
        interpreter.run(input, output)
        return output[0]
    }

    private fun bitmapToBuffer(bitmap: Bitmap): ByteBuffer {
        val buf = ByteBuffer.allocateDirect(1 * 112 * 112 * 3 * 4)
        buf.order(ByteOrder.nativeOrder())
        val pixels = IntArray(112 * 112)
        bitmap.getPixels(pixels, 0, 112, 0, 0, 112, 112)
        for (px in pixels) {
            buf.putFloat(((px shr 16 and 0xFF) - 127.5f) / 128f) // R
            buf.putFloat(((px shr 8  and 0xFF) - 127.5f) / 128f) // G
            buf.putFloat(((px        and 0xFF) - 127.5f) / 128f) // B
        }
        return buf
    }
}
```

**Step 3: Commit**
```bash
git add android/src/main/java/ai/unlikeother/faceskit/FaceDetector.kt \
        android/src/main/java/ai/unlikeother/faceskit/FaceEmbedder.kt
git commit -m "feat(android): ML Kit face detector and TFLite MobileFaceNet embedder"
```

---

## Task 12: Android FaceMatcher + WorkerStore

**Files:**
- Create: `android/src/main/java/ai/unlikeother/faceskit/FaceMatcher.kt`
- Create: `android/src/main/java/ai/unlikeother/faceskit/WorkerStore.kt`

**Step 1: Write FaceMatcher**

```kotlin
package ai.unlikeother.faceskit

internal class FaceMatcher {
    data class Candidate(val worker: Worker, val score: Float)

    fun bestMatch(embedding: FloatArray, workers: List<Worker>, threshold: Float): Candidate? {
        var best: Candidate? = null
        for (worker in workers) {
            val score = dot(embedding, worker.averageEmbedding)
            if (score > threshold && score > (best?.score ?: -1f)) {
                best = Candidate(worker, score)
            }
        }
        return best
    }

    // Both vectors are L2-normalised so cosine = dot product
    private fun dot(a: FloatArray, b: FloatArray): Float {
        var sum = 0f
        for (i in a.indices) sum += a[i] * b[i]
        return sum
    }
}
```

**Step 2: Write WorkerStore**

```kotlin
package ai.unlikeother.faceskit

import android.content.Context
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import java.io.File
import java.util.concurrent.locks.ReentrantReadWriteLock
import kotlin.concurrent.read
import kotlin.concurrent.write

internal class WorkerStore(context: Context) {
    private val file = File(context.filesDir, "faceskit/workers.json").also {
        it.parentFile?.mkdirs()
    }
    private val gson = Gson()
    private val lock = ReentrantReadWriteLock()
    private val cache: MutableMap<String, Worker> = loadFromDisk().toMutableMap()

    fun save(worker: Worker) = lock.write {
        cache[worker.id] = worker
        persist()
    }

    fun delete(workerId: String) = lock.write {
        cache.remove(workerId)
        persist()
    }

    fun all(): List<Worker> = lock.read { cache.values.toList() }

    private fun persist() {
        file.writeText(gson.toJson(cache.values.toList()))
    }

    private fun loadFromDisk(): Map<String, Worker> {
        if (!file.exists()) return emptyMap()
        val type = object : TypeToken<List<Worker>>() {}.type
        return try {
            val list: List<Worker> = gson.fromJson(file.readText(), type)
            list.associateBy { it.id }
        } catch (_: Exception) { emptyMap() }
    }
}
```

**Step 3: Write Android unit tests**

`android/src/test/java/ai/unlikeother/faceskit/FacesKitTest.kt`:

```kotlin
package ai.unlikeother.faceskit

import org.junit.Assert.*
import org.junit.Test
import kotlin.math.sqrt

class FacesKitTest {

    @Test fun `l2Normalize produces unit vector`() {
        val v = floatArrayOf(3f, 4f).l2Normalize()
        assertEquals(0.6f, v[0], 1e-5f)
        assertEquals(0.8f, v[1], 1e-5f)
    }

    @Test fun `averageEmbedding is normalised`() {
        val avg = averageEmbedding(listOf(floatArrayOf(1f, 0f), floatArrayOf(0f, 1f)))
        val norm = sqrt(avg.fold(0f) { a, v -> a + v * v })
        assertEquals(1.0f, norm, 1e-5f)
    }

    @Test fun `matcher returns null below threshold`() {
        val matcher = FaceMatcher()
        val worker = Worker("w1", "Alice",
            listOf(floatArrayOf(0f, 1f).l2Normalize()),
            floatArrayOf(0f, 1f).l2Normalize())
        val result = matcher.bestMatch(floatArrayOf(1f, 0f).l2Normalize(),
            listOf(worker), 0.70f)
        assertNull(result)
    }

    @Test fun `matcher returns match above threshold`() {
        val matcher = FaceMatcher()
        val emb = floatArrayOf(1f, 0f).l2Normalize()
        val worker = Worker("w1", "Alice", listOf(emb), emb)
        val result = matcher.bestMatch(emb, listOf(worker), 0.70f)
        assertNotNull(result)
        assertEquals(1.0f, result!!.score, 1e-5f)
    }
}
```

**Step 4: Run tests**
```bash
cd android && ./gradlew test
```
Expected: 4 tests pass.

**Step 5: Commit**
```bash
git add android/src/
git commit -m "feat(android): cosine matcher, thread-safe worker store, unit tests"
```

---

## Task 13: React Native bridge scaffold

**Files:**
- Create: `react/react-native-faces/package.json`
- Create: `react/react-native-faces/src/index.ts`
- Create: `react/react-native-faces/src/NativeFaces.ts`
- Create: `react/react-native-faces/tsconfig.json`

**Step 1: Write package.json**

```json
{
  "name": "react-native-faces",
  "version": "0.1.0",
  "description": "Cross-platform face identification for React Native",
  "main": "lib/commonjs/index",
  "module": "lib/module/index",
  "types": "lib/typescript/index.d.ts",
  "react-native": "src/index",
  "source": "src/index",
  "license": "MIT",
  "codegenConfig": {
    "name": "RNFacesSpec",
    "type": "modules",
    "jsSrcsDir": "src"
  },
  "peerDependencies": {
    "react": "*",
    "react-native": "*"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

**Step 2: Write NativeFaces.ts (TurboModule spec)**

```typescript
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Worker {
  id: string;
  name: string;
  lastUpdated: number;
}

export interface MatchResult {
  workerId: string;
  workerName: string;
  score: number;
  latencyMs: number;
}

export interface Spec extends TurboModule {
  startRecognition(): Promise<void>;
  stopRecognition(): Promise<void>;
  registerWorker(workerId: string, name: string, photos: string[]): Promise<void>;
  deleteWorker(workerId: string): Promise<void>;
  getWorkers(): Promise<Worker[]>;
  addListener(eventType: string): void;
  removeListeners(count: number): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('RNFaces');
```

**Step 3: Write index.ts (public JS API)**

```typescript
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import type { Worker, MatchResult } from './NativeFaces';

const LINKING_ERROR =
  `react-native-faces: native module not found. ` +
  `Ensure the library is linked and you have rebuilt the app.`;

const RNFaces =
  NativeModules.RNFaces ??
  new Proxy({}, { get() { throw new Error(LINKING_ERROR); } });

const emitter = new NativeEventEmitter(RNFaces);

const FaceID = {
  startRecognition: (): Promise<void> => RNFaces.startRecognition(),
  stopRecognition: (): Promise<void> => RNFaces.stopRecognition(),

  registerWorker: (workerId: string, name: string, photos: string[]): Promise<void> =>
    RNFaces.registerWorker(workerId, name, photos),

  deleteWorker: (workerId: string): Promise<void> =>
    RNFaces.deleteWorker(workerId),

  getWorkers: (): Promise<Worker[]> => RNFaces.getWorkers(),

  onFaceRecognized: (callback: (match: MatchResult) => void): (() => void) => {
    const sub = emitter.addListener('onFaceRecognized', callback);
    return () => sub.remove();
  },
};

export default FaceID;
export type { Worker, MatchResult };
```

**Step 4: Commit**
```bash
git add react/react-native-faces/
git commit -m "feat(rn): React Native bridge scaffold — TurboModule spec and JS API"
```

---

## Task 14: iOS RN bridge

**Files:**
- Create: `react/react-native-faces/ios/RNFaces.swift`
- Create: `react/react-native-faces/ios/RNFaces.m`

**Step 1: Write RNFaces.m (Objective-C bridge header)**

```objc
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(RNFaces, RCTEventEmitter)

RCT_EXTERN_METHOD(startRecognition:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopRecognition:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(registerWorker:(NSString *)workerId
                  name:(NSString *)name
                  photos:(NSArray<NSString *> *)photos
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deleteWorker:(NSString *)workerId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getWorkers:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup { return NO; }

@end
```

**Step 2: Write RNFaces.swift**

```swift
import Foundation
import FacesKit
import UIKit

@objc(RNFaces)
class RNFaces: RCTEventEmitter {
    private var hasListeners = false

    override func supportedEvents() -> [String]! { ["onFaceRecognized"] }
    override func startObserving() {
        hasListeners = true
        FacesKit.shared.onMatch = { [weak self] match in
            self?.sendEvent(withName: "onFaceRecognized", body: [
                "workerId":   match.worker.id,
                "workerName": match.worker.name,
                "score":      match.score,
                "latencyMs":  match.latencyMs
            ])
        }
    }
    override func stopObserving() {
        hasListeners = false
        FacesKit.shared.onMatch = nil
    }

    @objc func startRecognition(_ resolve: RCTPromiseResolveBlock,
                                rejecter reject: RCTPromiseRejectBlock) {
        FacesKit.shared.start()
        resolve(nil)
    }

    @objc func stopRecognition(_ resolve: RCTPromiseResolveBlock,
                               rejecter reject: RCTPromiseRejectBlock) {
        FacesKit.shared.stop()
        resolve(nil)
    }

    @objc func registerWorker(_ workerId: String, name: String, photos: [String],
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {
        let images = photos.compactMap { photoPath -> CGImage? in
            let url = photoPath.hasPrefix("file://")
                ? URL(string: photoPath) : URL(fileURLWithPath: photoPath)
            return url.flatMap { UIImage(contentsOfFile: $0.path)?.cgImage }
        }
        FacesKit.shared.register(workerId: workerId, name: name, photos: images) { result in
            switch result {
            case .success: resolve(nil)
            case .failure(let e): reject("REGISTER_ERROR", e.localizedDescription, e)
            }
        }
    }

    @objc func deleteWorker(_ workerId: String,
                            resolver resolve: RCTPromiseResolveBlock,
                            rejecter reject: RCTPromiseRejectBlock) {
        do {
            try FacesKit.shared.delete(workerId: workerId)
            resolve(nil)
        } catch {
            reject("DELETE_ERROR", error.localizedDescription, error)
        }
    }

    @objc func getWorkers(_ resolve: RCTPromiseResolveBlock,
                          rejecter reject: RCTPromiseRejectBlock) {
        let workers = FacesKit.shared.workers().map {
            ["id": $0.id, "name": $0.name, "lastUpdated": $0.lastUpdated.timeIntervalSince1970]
        }
        resolve(workers)
    }
}
```

**Step 3: Commit**
```bash
git add react/react-native-faces/ios/
git commit -m "feat(rn-ios): Swift/ObjC bridge for FacesKit — all JS API methods wired"
```

---

## Task 15: Android RN bridge

**Files:**
- Create: `react/react-native-faces/android/src/main/java/ai/unlikeother/rnfaces/RNFacesModule.kt`
- Create: `react/react-native-faces/android/src/main/java/ai/unlikeother/rnfaces/RNFacesPackage.kt`

**Step 1: Write RNFacesModule.kt**

```kotlin
package ai.unlikeother.rnfaces

import ai.unlikeother.faceskit.FacesKit
import ai.unlikeother.faceskit.MatchResult
import android.graphics.BitmapFactory
import android.net.Uri
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File

class RNFacesModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "RNFaces"

    private fun sendEvent(name: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, params)
    }

    @ReactMethod fun addListener(eventType: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod
    fun startRecognition(promise: Promise) {
        FacesKit.onMatch = { match: MatchResult ->
            val map = Arguments.createMap().apply {
                putString("workerId",   match.worker.id)
                putString("workerName", match.worker.name)
                putDouble("score",      match.score.toDouble())
                putDouble("latencyMs",  match.latencyMs.toDouble())
            }
            sendEvent("onFaceRecognized", map)
        }
        FacesKit.start(reactContext)
        promise.resolve(null)
    }

    @ReactMethod
    fun stopRecognition(promise: Promise) {
        FacesKit.stop()
        promise.resolve(null)
    }

    @ReactMethod
    fun registerWorker(workerId: String, name: String, photos: ReadableArray, promise: Promise) {
        val bitmaps = (0 until photos.size()).mapNotNull { i ->
            val path = photos.getString(i)?.removePrefix("file://") ?: return@mapNotNull null
            BitmapFactory.decodeFile(path)
        }
        FacesKit.register(workerId, name, bitmaps) { result ->
            result.fold({ promise.resolve(null) }, { promise.reject("REGISTER_ERROR", it) })
        }
    }

    @ReactMethod
    fun deleteWorker(workerId: String, promise: Promise) {
        FacesKit.delete(workerId)
        promise.resolve(null)
    }

    @ReactMethod
    fun getWorkers(promise: Promise) {
        val arr = Arguments.createArray()
        FacesKit.workers().forEach { w ->
            Arguments.createMap().also {
                it.putString("id", w.id)
                it.putString("name", w.name)
                it.putDouble("lastUpdated", w.lastUpdated.toDouble())
                arr.pushMap(it)
            }
        }
        promise.resolve(arr)
    }
}
```

**Step 2: Write RNFacesPackage.kt**

```kotlin
package ai.unlikeother.rnfaces

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RNFacesPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext) = listOf(RNFacesModule(ctx))
    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
```

**Step 3: Commit**
```bash
git add react/react-native-faces/android/
git commit -m "feat(rn-android): Kotlin bridge for FacesKit — all JS API methods wired"
```

---

## Task 16: Registration example app

**Files:**
- Create: `examples/registration/` (React Native app, init separately)
- Create: `examples/registration/src/App.tsx`
- Create: `examples/registration/src/screens/RegistrationScreen.tsx`
- Create: `examples/registration/src/screens/WorkerListScreen.tsx`

**Step 1: Init RN app**
```bash
cd examples && npx @react-native-community/cli init registration --skip-install
cd registration && pnpm install
```

**Step 2: Link react-native-faces**

In `examples/registration/package.json` add:
```json
"react-native-faces": "../../react/react-native-faces"
```

**Step 3: Write RegistrationScreen.tsx**

Key elements — all with `accessibilityLabel` matching AppReveal element IDs:

```tsx
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, AccessibilityInfo } from 'react-native';
import { launchCamera } from 'react-native-image-picker';
import FaceID from 'react-native-faces';

export default function RegistrationScreen() {
  const [photos, setPhotos] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');

  const capture = async () => {
    const result = await launchCamera({ mediaType: 'photo', cameraType: 'front' });
    if (result.assets?.[0]?.uri) {
      setPhotos(p => [...p, result.assets![0].uri!]);
    }
  };

  const save = async () => {
    setStatus('Saving...');
    try {
      await FaceID.registerWorker(Date.now().toString(), name, photos);
      setStatus('Saved!');
      setPhotos([]);
      setName('');
    } catch (e: any) {
      setStatus(`Error: ${e.message}`);
    }
  };

  return (
    <View style={styles.container}>
      <Text accessibilityLabel="registration.title" style={styles.title}>Register User</Text>

      <TextInput
        accessibilityLabel="registration.name_input"
        placeholder="Name"
        value={name}
        onChangeText={setName}
        style={styles.input}
      />

      <Text accessibilityLabel="registration.photo_count" style={styles.count}>
        Photos: {photos.length} / 5
      </Text>

      <TouchableOpacity
        accessibilityLabel="registration.capture_button"
        onPress={capture}
        disabled={photos.length >= 5}
        style={styles.button}
      >
        <Text>Take Photo</Text>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityLabel="registration.save_button"
        onPress={save}
        disabled={photos.length < 3 || !name}
        style={styles.button}
      >
        <Text>Save</Text>
      </TouchableOpacity>

      <Text accessibilityLabel="registration.status" style={styles.status}>{status}</Text>
    </View>
  );
}
```

**Step 4: Write WorkerListScreen.tsx**

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import FaceID, { Worker } from 'react-native-faces';

export default function WorkerListScreen() {
  const [workers, setWorkers] = useState<Worker[]>([]);

  const refresh = () => FaceID.getWorkers().then(setWorkers);
  useEffect(() => { refresh(); }, []);

  return (
    <View style={styles.container}>
      <Text accessibilityLabel="workerlist.title" style={styles.title}>Registered Users</Text>
      <FlatList
        accessibilityLabel="workerlist.list"
        data={workers}
        keyExtractor={w => w.id}
        renderItem={({ item, index }) => (
          <View accessibilityLabel={`workerlist.item_${index}`} style={styles.row}>
            <Text>{item.name}</Text>
            <TouchableOpacity
              accessibilityLabel={`workerlist.delete_${index}`}
              onPress={() => FaceID.deleteWorker(item.id).then(refresh)}
            >
              <Text style={styles.delete}>Delete</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}
```

**Step 5: Commit**
```bash
git add examples/registration/
git commit -m "feat(examples): registration app — capture, save, list workers"
```

---

## Task 17: Recognition example app

**Files:**
- Create: `examples/recognition/src/screens/RecognitionScreen.tsx`

Key accessibility labels (AppReveal targets):
- `recognition.timestamp` — current time display
- `recognition.matched_user` — name of matched user (or "No match")
- `recognition.score` — similarity score
- `recognition.status` — running/stopped indicator

```tsx
import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import FaceID, { MatchResult } from 'react-native-faces';

export default function RecognitionScreen() {
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [time, setTime] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    FaceID.startRecognition();
    const unsub = FaceID.onFaceRecognized(setMatch);
    return () => { clearInterval(timer); FaceID.stopRecognition(); unsub(); };
  }, []);

  return (
    <View style={styles.container}>
      <Text accessibilityLabel="recognition.timestamp" style={styles.time}>{time}</Text>
      <Text
        accessibilityLabel="recognition.matched_user"
        style={[styles.name, match ? styles.matched : styles.none]}
      >
        {match ? match.workerName : 'No match'}
      </Text>
      <Text accessibilityLabel="recognition.score" style={styles.score}>
        {match ? `Score: ${match.score.toFixed(3)}` : '—'}
      </Text>
      <Text accessibilityLabel="recognition.status" style={styles.status}>Live</Text>
    </View>
  );
}
```

**Step 2: Commit**
```bash
git add examples/recognition/
git commit -m "feat(examples): recognition app — live match display with timestamp"
```

---

## Task 18: Debug example app

**Files:**
- Create: `examples/debug/src/screens/DebugScreen.tsx`

Key accessibility labels:
- `debug.fps` — frames per second
- `debug.latency_ms` — last embedding latency in ms
- `debug.similarity_score` — last similarity score
- `debug.matched_user` — matched name or "—"
- `debug.timestamp` — current time

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import FaceID, { MatchResult } from 'react-native-faces';

export default function DebugScreen() {
  const [match, setMatch] = useState<MatchResult | null>(null);
  const [fps, setFps] = useState(0);
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const frameTimesRef = useRef<number[]>([]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    FaceID.startRecognition();
    const unsub = FaceID.onFaceRecognized((m) => {
      setMatch(m);
      const now = Date.now();
      frameTimesRef.current = [...frameTimesRef.current.filter(t => now - t < 1000), now];
      setFps(frameTimesRef.current.length);
    });
    return () => { clearInterval(timer); FaceID.stopRecognition(); unsub(); };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Debug Panel</Text>
      <Row label="Time"    value={time}                                 id="debug.timestamp" />
      <Row label="FPS"     value={String(fps)}                          id="debug.fps" />
      <Row label="Latency" value={match ? `${match.latencyMs}ms` : '—'} id="debug.latency_ms" />
      <Row label="Score"   value={match ? match.score.toFixed(4) : '—'} id="debug.similarity_score" />
      <Row label="Match"   value={match?.workerName ?? '—'}             id="debug.matched_user" />
    </ScrollView>
  );
}

function Row({ label, value, id }: { label: string; value: string; id: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text accessibilityLabel={id} style={styles.value}>{value}</Text>
    </View>
  );
}
```

**Step 3: Commit**
```bash
git add examples/debug/
git commit -m "feat(examples): debug app — FPS, latency, score, match overlay"
```

---

## Task 19: AppReveal integration

**Files:**
- Modify: `examples/registration/ios/AppDelegate.swift`
- Modify: `examples/registration/android/app/src/main/java/.../MainApplication.kt`
- (same for recognition and debug apps)

**Step 1: iOS — add AppReveal to each example**

In each example's `Package.swift` or Podfile, add:
```swift
.package(url: "https://github.com/UnlikeOtherAI/AppReveal.git", from: "0.2.0")
```

In `AppDelegate.swift`:
```swift
#if DEBUG
import AppReveal
#endif

func application(...) -> Bool {
  #if DEBUG
  AppReveal.start()
  #endif
  // ...
}
```

**Step 2: Android — add AppReveal to each example**

In `app/build.gradle.kts`:
```kotlin
debugImplementation("com.appreveal:appreveal:<version>")
releaseImplementation("com.appreveal:appreveal-noop:<version>")
```

In `MainApplication.kt`:
```kotlin
import com.appreveal.AppReveal

override fun onCreate() {
    super.onCreate()
    if (BuildConfig.DEBUG) AppReveal.start(this)
}
```

**Step 3: Commit**
```bash
git add examples/
git commit -m "feat(examples): embed AppReveal in all three example apps (debug only)"
```

---

## Task 20: E2E test run

This is a manual/agent-driven step. See `docs/testing.md` for full instructions.

**Pre-conditions:**
- Model downloaded (`scripts/download_models.sh` run)
- Model converted (`scripts/convert_to_coreml.py` run)
- Example app built and running on simulator/device with AppReveal active
- Claude Code connected to AppReveal MCP server

**Checklist — run on both iOS and Android:**

- [ ] `recognition.timestamp` is visible and updates every second
- [ ] Register a user (registration app) → `registration.status` shows "Saved!"
- [ ] `workerlist.item_0` visible after save
- [ ] Launch recognition app → hold photo of registered face near camera
- [ ] `recognition.matched_user` shows correct name within 300ms
- [ ] `recognition.score` > 0.70
- [ ] Debug app: `debug.fps` > 0, `debug.latency_ms` < 300, `debug.similarity_score` populated

**Step 1: Run via AppReveal MCP**

```bash
# Claude Code will drive this via MCP tools:
# get_screen, get_elements, tap_element, screenshot, get_state
```

**Step 2: Commit results**
```bash
git add docs/testing-results.md   # document pass/fail per platform
git commit -m "test: E2E test results — iOS and Android"
```

---

## Final structure

```
Faces/
├── ios/                           # Swift Package — FacesKit
│   ├── Package.swift
│   ├── Sources/FacesKit/
│   │   ├── FacesKit.swift
│   │   ├── Models.swift
│   │   ├── CameraEngine.swift
│   │   ├── FaceDetector.swift
│   │   ├── FaceEmbedder.swift
│   │   ├── FaceMatcher.swift
│   │   ├── WorkerStore.swift
│   │   └── Resources/             # MobileFaceNet.mlpackage (gitignored)
│   └── Tests/FacesKitTests/
├── android/                       # Gradle library — faceskit AAR
│   ├── build.gradle.kts
│   └── src/main/java/ai/unlikeother/faceskit/
├── react/
│   └── react-native-faces/        # RN TurboModule
│       ├── src/
│       ├── ios/
│       └── android/
├── examples/
│   ├── registration/
│   ├── recognition/
│   └── debug/
├── models/                        # gitignored model files
├── scripts/
│   ├── download_models.sh
│   └── convert_to_coreml.py
└── docs/
    ├── architecture.md
    ├── testing.md
    └── plans/
```
