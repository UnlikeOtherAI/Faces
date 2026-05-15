# Mesh RN Example App

## Purpose

React Native example app that ports the `mesh/basic.html` browser demo to React Native. Renders the guided face capture card inside a WebView, keeps the MediaPipe FaceMesh capture pipeline, and emits typed events to React Native.

## Scope

- One screen. No tabs, no persistence, no list views.
- `App.tsx` mounts a single `<MeshCaptureCard />` full-screen.
- iOS and Android load the same web assets.
- The fallback view shows when `meshHtml` prop is missing.

## Why a WebView

The capture pipeline (MediaPipe FaceMesh, gaze maths, canvas rendering, photo snapshots) already exists as plain web code. Rather than reimplement it natively, we load the web code in a WebView and bridge it to React Native via `postMessage`. No native vision module, no `FacesCaptureKit` dependency, no `react-native-faces-capture`.

## Visual Contract

- The first screen matches the face-recognition setup design: close button, neutral segmented ring, face icon, title, and bottom action.
- The scan screen keeps the same MediaPipe target matching and photo timing, but replaces the old directional wave with a segmented green progress ring around the circular camera preview.
- The ring ticks start outside the camera circle with a small gap so they do not touch the video edge.
- Completion shows a full green ring, `100%`, `All done!`, and a bottom `Continue` action.

## Layout

```
examples/mesh/
  index.js
  App.tsx                                 — wires events, renders the card
  components/MeshCaptureCard.tsx          — reusable WebView + event bridge
  package.json                            — only RN + react-native-webview
  metro.config.js
  ios/
    project.yml                           — xcodegen
    Podfile
    FacesMesh/
      AppDelegate.swift                   — inlines web/* into one HTML string, passes via initialProps
      Info.plist                          — UIViewControllerBasedStatusBarAppearance=NO, NSCameraUsageDescription
      web/
        basic.html, basic.css,
        basic.js, basic-config.js          — MediaPipe capture and Figma-style canvas UI
  android/
    app/src/main/assets/web/               — same web assets as iOS
```

## Data Flow

1. `AppDelegate` / `MainActivity` read `web/basic.{css,js}` + `web/basic-config.js`, inline them into one `<html>` string, and pass it as `meshHtml` initial prop.
2. `App.tsx` renders `<MeshCaptureCard meshHtml={...} onCapture={...} onComplete={...} />`.
3. `MeshCaptureCard` mounts a `<WebView>` with `source={{ html: meshHtml, baseUrl: 'https://faces.local/' }}`. The `https://` baseUrl is required so the page is a secure context; without it, `getUserMedia` is blocked by WKWebView.
4. `mediaCapturePermissionGrantType="grant"` pre-grants camera permission. The user-facing flow starts when the web UI's `Get Started` action calls `start()`.
5. On each successful capture and on completion, `basic.js` calls `window.ReactNativeWebView.postMessage(JSON.stringify({ type, ... }))`.
6. `MeshCaptureCard.handleMessage` parses and dispatches typed events: `capture`, `complete`, `ready`, `error`, `log`.

## Bridge Events

| `type`     | Payload                                                                   |
|------------|---------------------------------------------------------------------------|
| `ready`    | `{}` — camera stream attached, mesh running                               |
| `capture`  | `{ id, name, direction, src, index, total }` — one per target captured    |
| `complete` | `{ captures: [{ id, name, direction, src }] }` — fires once after target 6 |
| `error`    | `{ message }` — webcam permission, mediapipe, or runtime error            |
| `log`      | `{ args: string[] }` — forwarded `console.log` for debugging              |

`src` is a JPEG `data:` URL (320×320, mirrored).

## Bundle Identity

- iOS bundle id: `ai.unlikeother.facesmesh`
- Android application id: `ai.unlikeother.facesmesh`
- Display name: `Faces Mesh`
- Development team: `59S95D279D`.

## Out of Scope

- Worker enrollment / persistence (that's `examples/registration`).
- Recognition (that's `examples/recognition`).
