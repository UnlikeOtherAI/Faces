# Mesh RN Example App

## Purpose

Standalone iOS example app that ports the `mesh/basic.html` browser demo to React Native. Renders the guided face capture card (camera view + indicator + 6 capture targets) inside a `WKWebView` and emits typed events to React Native.

## Scope

- One screen. No tabs, no persistence, no list views.
- `App.tsx` mounts a single `<MeshCaptureCard />` full-screen.
- iOS only. The fallback view shows on Android / when `meshHtml` prop is missing.

## Why a WebView

The capture pipeline (MediaPipe FaceMesh, gaze maths, canvas overlay) already exists as plain web code in `mesh/basic.html`. Rather than reimplement it natively, we load that exact code in a `WKWebView` and bridge it to React Native via `postMessage`. No native vision module, no `FacesCaptureKit` dependency, no `react-native-faces-capture`.

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
        basic.js, basic-config.js          — copied verbatim from /mesh/
```

## Data Flow

1. `AppDelegate` reads `web/basic.{html,css,js}` + `web/basic-config.js` from the bundle, inlines them into one `<html>` string, passes it as `meshHtml` initial prop.
2. `App.tsx` renders `<MeshCaptureCard meshHtml={...} onCapture={...} onComplete={...} />`.
3. `MeshCaptureCard` mounts a `<WebView>` with `source={{ html: meshHtml, baseUrl: 'https://faces.local/' }}`. The `https://` baseUrl is required so the page is a secure context — without it, `getUserMedia` is blocked by WKWebView.
4. `mediaCapturePermissionGrantType="grant"` pre-grants camera permission so `start()` can run on load with no user gesture.
5. `basic.js` calls `start()` automatically at the end of the script. On each successful capture and on completion it calls `window.ReactNativeWebView.postMessage(JSON.stringify({ type, ... }))`.
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
- Display name: `Faces Mesh`
- Development team: `59S95D279D`.

## Out of Scope

- Worker enrollment / persistence (that's `examples/registration`).
- Recognition (that's `examples/recognition`).
- Android (the JS code paths fall back to the iOS-only message).
