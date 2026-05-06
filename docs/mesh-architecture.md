# Mesh Wave Demo Architecture

## Purpose

Provide a browser demo that uses webcam face landmarks to drive a directional radial wave effect.

## Scope

- Main page at `mesh/index.html`, which opens `mesh/basic.html`
- Canvas mode at `mesh/basic.html`
- Browser-only runtime (no build tools)
- One detected face at a time
- Straight-ahead gaze hides the directional pointer
- Guided capture targets 1-5 around the face area, followed by target 6 at the nose/straight-ahead position
- Captured frames render as local browser thumbnails inside the same capture card

## Runtime Flow

1. Open `mesh/index.html`, which launches the Basic canvas mode.
2. Request webcam access with `navigator.mediaDevices.getUserMedia`.
3. Attach stream to a hidden `<video>` element for frame input.
4. Load MediaPipe FaceMesh from CDN.
5. For each frame:
   - Read nose tip and eye landmarks.
   - Estimate head direction (`yaw`, `pitch`) from nose offset relative to eye midpoint.
   - Smooth direction values to reduce jitter.
   - Render Canvas 2D radial spikes only when gaze leaves the neutral zone.
   - If the active target is held for enough frames, snapshot the canvas and advance to the next target.

## Key Decisions

- Use MediaPipe FaceMesh CDN scripts for quick setup and no local model files.
- Use a static redirect from the root page to keep setup simple.
- Keep the directional pointer hidden while the user looks straight at the camera.
- Keep capture thumbnails in page memory only; no files are written by the browser demo.

## Constraints

- Webcam requires a secure context (`https://` or `http://localhost`).
- Direction estimate is head orientation, not precise gaze.
- Demos target modern Chromium/Safari/Firefox browsers.

## Future Extensions

- Add iris landmarks for gaze approximation.
- Add sensitivity and smoothing controls in-page.
- Combine video masking and WebGL into one pipeline for full GPU rendering.
