# Guided Registration Capture

## Status

Draft.

This doc defines the replacement for the current example registration flow in
`examples/registration/src/screens/RegistrationScreen.tsx`.

For the example app, this doc supersedes the older "capture 3-5 photos" guidance.

## Goal

Replace the current repeated `launchCamera()` flow with a guided, in-app
registration flow that captures exactly six usable enrollment photos in a fixed
order.

## Scope

Applies to:

- `examples/registration`
- the new guided capture product defined in [faces-capture-architecture.md](faces-capture-architecture.md)
- the integration boundary between guided capture and `Faces`

Out of scope:

- changing the recognition example UX
- gallery import for registration
- variable-length registration
- skipping or reordering pose steps

## Required Capture Contract

Registration must collect exactly six accepted photos.

- Fewer than six photos is invalid.
- More than six photos is invalid.
- Save stays disabled until all six required photos are accepted.
- The capture order is fixed and cannot be skipped.

### Pose Sequence

| Step | Pose ID | User instruction |
| ---- | ------- | ---------------- |
| 1 | `left_top` | Look to the top-left |
| 2 | `top` | Look up |
| 3 | `top_right` | Look to the top-right |
| 4 | `bottom_right` | Look to the bottom-right |
| 5 | `bottom_left` | Look to the bottom-left |
| 6 | `straight` | Just look straight into the camera |

## UX Summary

The registration screen must move from "take a few selfies" to a guided capture
experience.

### Layout

- A circular live front-camera preview sits in the center of the screen.
- The user's face must be framed inside that circle before capture is allowed.
- A progress ring wraps the circle.
- Primary instruction text sits directly under the circle.
- Secondary helper or blocker text sits under the primary instruction.
- A shutter button remains explicit. The app should not auto-capture in v1.

### Progress Ring

The ring has exactly five outer segments, one for each off-center directional
step.

- Steps 1-5 map to the five ring segments.
- The active target segment pulses in a pastel orange / yellow accent.
- Completed segments fill solid in the same accent and stop pulsing.
- Future segments stay muted.
- Progress advances clockwise after a successful capture.
- Step 6 does not add a sixth outer segment. When the first five segments are
  complete, the full ring stays filled and the circle outline becomes the active
  pulsing state for the final straight-on capture.

### Copy

Each step must show a single instruction under the capture circle.

Required instruction strings:

- Step 1: `Look to the top-left`
- Step 2: `Look up`
- Step 3: `Look to the top-right`
- Step 4: `Look to the bottom-right`
- Step 5: `Look to the bottom-left`
- Step 6: `Just look straight into the camera`

## Capture Gating

A photo is only accepted when all of the following are true:

- exactly one face is detected
- the face is inside the circular guide
- the face size is within the allowed enrollment range
- the detected pose matches the current target pose
- lighting is good enough for face recognition
- the frame is sharp enough for enrollment
- the pose is stable for a short hold window before the shutter is enabled

If capture is blocked for lighting, the UI must show this exact copy:

`We cannot continue unless you get better lighting.`

Lighting failure is a hard stop:

- the shutter must be disabled
- the pose step does not advance
- the blocking copy overrides normal pose guidance

For non-lighting failures, the UI may show targeted helper text such as:

- move your face inside the circle
- hold still
- only one face should be visible
- move closer

## Visual Direction

The ring should feel warm and calm rather than like an error state.

- Active accent: pastel orange / yellow
- Completed state: same accent, solid fill, no pulse
- Inactive state: low-contrast neutral
- Error state: use blocker text first; avoid turning the progress ring into a red
  warning component unless the design explicitly calls for it

## Interaction Model

- The user taps the shutter only when the current pose is ready.
- On successful capture, the current step locks immediately.
- The progress ring updates immediately after capture.
- The next required instruction appears immediately after capture.
- After step 5, the ring remains complete while the final straight-on step uses
  the center circle as the active state.
- The registration payload passed to `registerWorker` must contain exactly six
  accepted photo URIs.

## Architecture

The example app should not try to infer pose or quality from raw image picker
results. Guided capture needs live analysis from the native layers.

Guided capture is a separate product from `Faces`. The package split and install
model are defined in [faces-capture-architecture.md](faces-capture-architecture.md).

### Native Responsibilities

The guided capture native products must provide per-frame guided capture
analysis without depending on the `Faces` identification frameworks.

Required outputs:

- normalized face bounds
- face present / multiple-face state
- current detected pose bucket
- face alignment against the circular target
- lighting quality state
- blur / sharpness state
- `canCapture` boolean for the current step
- blocking reason when capture is disallowed

Pose classification belongs in the native layer. The React Native layer should
render UI from native state, not derive pose from bounding boxes in JS.

### React Native Bridge

The React Native capture module needs a guided capture surface that works on
both iOS and Android as a standalone installable package.

Minimum additions:

- a real cross-platform capture preview view
- a live guided-capture event stream
- a capture method that returns a persisted photo URI only when the current step
  is valid

Proposed shape:

```ts
type GuidedPose =
  | 'left_top'
  | 'top'
  | 'top_right'
  | 'bottom_right'
  | 'bottom_left'
  | 'straight';

type GuidedBlockReason =
  | 'none'
  | 'no_face'
  | 'multiple_faces'
  | 'out_of_frame'
  | 'wrong_pose'
  | 'bad_lighting'
  | 'too_blurry'
  | 'hold_still';

interface GuidedCaptureState {
  targetPose: GuidedPose;
  detectedPose?: GuidedPose;
  faceRect?: { x: number; y: number; width: number; height: number };
  faceInsideGuide: boolean;
  lightingOk: boolean;
  sharpnessOk: boolean;
  stable: boolean;
  canCapture: boolean;
  blockReason: GuidedBlockReason;
}
```

Suggested module surface:

```ts
FacesCapture.startGuidedCapture(): Promise<void>
FacesCapture.stopGuidedCapture(): Promise<void>
FacesCapture.capturePhoto(targetPose: GuidedPose): Promise<string>
FacesCapture.onCaptureState(callback: (state: GuidedCaptureState) => void): () => void
```

`capturePhoto()` must reject when the requested pose does not match the
current valid guided-capture state.

### Example App Responsibilities

`examples/registration` owns:

- the six-step capture state machine
- the progress ring UI
- the step instructions
- the blocker copy
- the accepted-photo list
- the final call to `react-native-faces.registerWorker`

The registration example should consume two products:

- the standalone guided capture package for capture state and accepted photo URIs
- `react-native-faces` only for final worker registration from those six URIs

## Accessibility And E2E

The guided registration flow needs stable IDs for AppReveal coverage.

Required elements:

- `registration.capture_preview`
- `registration.capture_ring`
- `registration.capture_instruction`
- `registration.capture_blocker`
- `registration.capture_shutter`
- `registration.capture_step_count`
- `registration.save_button`
- `registration.status`

Required E2E coverage:

- the user cannot save with fewer than six accepted photos
- the pose sequence advances in the required order
- the active segment pulses before capture
- each completed segment becomes solid after capture
- the sixth straight-on step uses the completed ring plus active center state
- bad lighting blocks capture and shows the exact required message
- the worker appears in the list after a successful six-photo registration
