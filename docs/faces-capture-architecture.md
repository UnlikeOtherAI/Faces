# Faces Capture Architecture

## Status

Draft.

This doc defines the new guided enrollment capture product as a separate,
installable framework family in the same repo.

It is intentionally separate from the existing face-identification product.

## Product Boundary

`Faces` and guided capture are two different products.

### Existing Product

The existing `Faces` stack is responsible for:

- face identification
- worker registration from already-captured photos
- embedding generation
- similarity matching
- worker persistence

### New Product

The new guided capture stack is responsible for:

- live front-camera preview
- circular framing UI support
- pose guidance
- lighting validation
- blur / stability validation
- capturing accepted enrollment photos

The guided capture stack must not own:

- face embeddings
- face identification
- similarity matching
- worker persistence
- worker registration business logic

## Packaging Rule

Guided capture must not be added as a feature inside `FacesKit`,
`android/faceskit`, or `react-native-faces`.

It must ship as a separate installable product family in the same repo.

## Proposed Repo Layout

```text
ios/                          Faces identification Swift Package
android/                      Faces identification Gradle library
react/react-native-faces      Faces identification RN module

ios-capture/                  Faces Capture Swift Package
android-capture/              Faces Capture Gradle library
react/react-native-faces-capture
                              Faces Capture RN module
```

These names are the target layout for implementation.

## Installability

Each product family must be installable on its own.

### Faces Identification

Consumers that only need identification should install only the existing
`Faces` packages.

### Faces Capture

Consumers that only need guided enrollment capture should be able to install
only the new `Faces Capture` packages.

### Combined Usage

Apps that need both flows may install both product families side by side.

Example:

- `react-native-faces-capture` handles the six-step guided capture UX
- `react-native-faces` receives the six accepted photo URIs and performs worker
  registration

This composition is the intended model for `examples/registration`.

## Native Products

### iOS

- Product: `FacesCaptureKit`
- Delivery: Swift Package
- Path target: `ios-capture/`

Responsibilities:

- AVFoundation front-camera preview
- per-frame face analysis
- pose bucketing
- lighting quality checks
- blur and hold-still checks
- accepted photo capture and persistence

It must not depend on `FacesKit`.

### Android

- Product: `facescapture`
- Delivery: Gradle library / AAR
- Path target: `android-capture/`

Responsibilities mirror iOS.

It must not depend on `android/faceskit`.

## React Native Product

- Package: `react-native-faces-capture`
- Path target: `react/react-native-faces-capture`

This module wraps the native capture products only.

It must not import `react-native-faces` internally.

## React Native API Direction

The capture module should expose a focused capture API rather than enrollment or
identification APIs.

Proposed surface:

```ts
type CapturePose =
  | 'left_top'
  | 'top'
  | 'top_right'
  | 'bottom_right'
  | 'bottom_left'
  | 'straight';

type CaptureBlockReason =
  | 'none'
  | 'no_face'
  | 'multiple_faces'
  | 'out_of_frame'
  | 'wrong_pose'
  | 'bad_lighting'
  | 'too_blurry'
  | 'hold_still';

interface CaptureState {
  targetPose: CapturePose;
  detectedPose?: CapturePose;
  faceInsideGuide: boolean;
  lightingOk: boolean;
  sharpnessOk: boolean;
  stable: boolean;
  canCapture: boolean;
  blockReason: CaptureBlockReason;
}

startGuidedCapture(): Promise<void>
stopGuidedCapture(): Promise<void>
capturePhoto(targetPose: CapturePose): Promise<string>
onCaptureState(callback: (state: CaptureState) => void): () => void
```

Returned values must be limited to capture state and accepted photo URIs.

The module must not expose:

- worker APIs
- embedding APIs
- match APIs

## Example App Composition

`examples/registration` should become a consumer of two packages:

- `react-native-faces-capture`
- `react-native-faces`

Flow:

1. Use `react-native-faces-capture` for the six guided capture steps.
2. Persist the six accepted photo URIs returned by the capture package.
3. Pass those URIs to `react-native-faces.registerWorker(...)`.

This keeps guided capture reusable for non-identification products.

## Quality And Model Separation

The capture product must not depend on the identification embedding model.

Acceptable inputs for the capture product:

- platform face detection
- platform face landmarks
- lightweight pose / quality heuristics
- a future dedicated capture-quality model, if we decide to add one later

Unacceptable coupling:

- importing MobileFaceNet just to power guided capture
- storing workers in the capture framework
- exposing identification concepts from the capture package

## Documentation Linkage

- UX and capture rules live in [registration-guided-capture.md](registration-guided-capture.md)
- identification architecture remains in [architecture.md](architecture.md)

Implementation for the new capture product should not begin until this
component-level architecture is accepted.
