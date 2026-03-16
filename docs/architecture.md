# Architecture

## Overview

Three independently usable layers:

```
React Native App
      │
react/react-native-faces   ← RN native module
      │                    │
ios/FacesKit (Swift PM)   android/faceskit (Gradle AAR)
```

Each layer can be used standalone. The native libraries have no React Native dependency.

---

## Layer 1: iOS — `ios/` (Swift Package Manager)

**Package name:** `FacesKit`

**Minimum target:** iOS 16

**Responsibilities:**
- Front camera frame capture via AVFoundation
- Face detection via Vision framework
- Face embedding via CoreML (MobileFaceNet, 128-dim)
- Cosine similarity matching against in-memory worker store
- Worker persistence (JSON on disk, encrypted with Data Protection)

**Public API:**
```swift
FacesKit.shared.start()
FacesKit.shared.stop()
FacesKit.shared.register(workerId:name:photos:completion:)
FacesKit.shared.delete(workerId:)
FacesKit.shared.workers() -> [Worker]
FacesKit.shared.onMatch = { match in ... }  // MatchResult
```

**Internal modules:**
- `CameraEngine` — AVCaptureSession, outputs CVPixelBuffer at ~15fps
- `FaceDetector` — Vision VNDetectFaceRectanglesRequest, crops face ROI
- `FaceEmbedder` — CoreML inference, returns [Float] (128-dim)
- `FaceMatcher` — cosine similarity, configurable threshold (default 0.70)
- `WorkerStore` — Codable workers, stored at app support dir, thread-safe

**Model:** MobileFaceNet CoreML (`MobileFaceNet.mlpackage`) — converted from TFLite via `scripts/convert_model.py`. Not committed to repo; see `models/README.md`.

**Performance targets:**
- Detection: <80ms
- Embedding: <120ms
- Match: <20ms
- Total pipeline: <300ms (every 3rd frame processed)

---

## Layer 2: Android — `android/` (Gradle library, AAR)

**Module name:** `faceskit`

**Minimum SDK:** API 26 (Android 8)

**Responsibilities:** Same as iOS layer, Android stack.

**Public API (Kotlin):**
```kotlin
FacesKit.start(context)
FacesKit.stop()
FacesKit.register(workerId, name, photos, callback)
FacesKit.delete(workerId)
FacesKit.workers(): List<Worker>
FacesKit.onMatch: ((MatchResult) -> Unit)?
```

**Internal modules:**
- `CameraEngine` — CameraX ImageAnalysis, YUV→Bitmap, ~15fps
- `FaceDetector` — ML Kit Face Detection, crops face Bitmap
- `FaceEmbedder` — TFLite interpreter + GPU delegate, 128-dim float array
- `FaceMatcher` — cosine similarity, configurable threshold (default 0.70)
- `WorkerStore` — JSON serialization, stored in app files dir, coroutine-safe

**Model:** MobileFaceNet TFLite (`mobilefacenet.tflite`) — not committed; see `models/README.md`.

**Performance targets:** same as iOS.

---

## Layer 3: React Native — `react/react-native-faces`

**Package name:** `react-native-faces`

**Architecture:** New Architecture (TurboModules) with legacy bridge fallback.

**JS API:**
```ts
FaceID.startRecognition(): Promise<void>
FaceID.stopRecognition(): Promise<void>
FaceID.registerWorker(workerId: string, name: string, photos: string[]): Promise<void>
FaceID.deleteWorker(workerId: string): Promise<void>
FaceID.getWorkers(): Promise<Worker[]>
FaceID.onFaceRecognized(callback: (match: MatchResult) => void): () => void
```

Photos are passed as base64 strings or `file://` URIs.

**Bridge files:**
- `ios/RNFaces.swift` + `ios/RNFaces.m` (ObjC bridge header)
- `android/src/main/java/ai/unlikeother/rnfaces/RNFacesModule.kt`
- `android/src/main/java/ai/unlikeother/rnfaces/RNFacesPackage.kt`

---

## Example Apps — `examples/`

Three standalone React Native apps, all using `react-native-faces` via local path dependency.

| App | Path | Purpose |
|-----|------|---------|
| Registration | `examples/registration` | Capture 3–5 photos, save worker |
| Recognition | `examples/recognition` | Live recognition, auto-login display |
| Debug | `examples/debug` | Similarity scores, FPS, latency overlay |

All embed AppReveal for E2E testing (debug builds only) — see [testing.md](testing.md).

---

## Models

See `models/README.md` for download and conversion instructions.

| Model | Format | Size | Dims |
|-------|--------|------|------|
| MobileFaceNet | TFLite | ~1MB | 128 |
| MobileFaceNet | CoreML mlpackage | ~1MB | 128 |

Models are gitignored. Each developer runs `scripts/download_models.sh` once after cloning.

---

## Data Format

Worker stored on-device:

```json
{
  "workerId": "string",
  "name": "string",
  "embeddings": [[float x 128], ...],
  "lastUpdated": "ISO8601"
}
```

Embeddings are L2-normalised before storage so cosine similarity reduces to a dot product.

---

## Matching Algorithm

```
for each worker:
    score = dot(embedding_live, embedding_worker_avg)
    track best_score, best_worker

if best_score > threshold (default 0.70):
    emit match(best_worker, best_score)
```

Average embedding per worker is pre-computed at registration time.
