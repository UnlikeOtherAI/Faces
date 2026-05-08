# Faces Mesh Example

iOS-only React Native example that ports `mesh/basic.html` (MediaPipe FaceMesh + gaze-driven 6-pose capture) into a `WKWebView` and exposes the result as a reusable React component, `<MeshCaptureCard />`.

## What you get

- Auto-starting front camera, circular crop, green wireframe overlay
- Radial green wave that tracks gaze direction
- 6 numbered capture targets, each captured automatically when held in gaze
- Square thumbnail strip with the captured photos
- Event-driven bridge — React side just listens for `capture` / `complete`

## Using the component

```tsx
import {
  MeshCaptureCard,
  type MeshCapture,
  type MeshCompletePayload,
} from './components/MeshCaptureCard';

function Screen({ meshHtml }: { meshHtml: string }) {
  return (
    <MeshCaptureCard
      meshHtml={meshHtml}
      onReady={() => console.log('camera live')}
      onCapture={(c: MeshCapture) => {
        // fires once per target (1..6) as the user looks each way
        // c.src is a `data:image/jpeg;base64,...` URL
        console.log(`${c.index + 1}/${c.total}`, c.name, c.direction);
      }}
      onComplete={(p: MeshCompletePayload) => {
        // fires once after target 6, with all six photos
        console.log('all done', p.captures.length);
      }}
      onError={(msg) => console.warn(msg)}
    />
  );
}
```

### Props

| Prop          | Type                                  | Notes                                           |
|---------------|---------------------------------------|-------------------------------------------------|
| `meshHtml`    | `string` (required)                   | Full HTML doc with inlined CSS+JS. See below.   |
| `onReady`     | `() => void`                          | Camera stream attached, mesh tracking running.  |
| `onCapture`   | `(c: MeshCapture) => void`            | Per-photo. Includes `index`, `total`, `src`.    |
| `onComplete`  | `(p: MeshCompletePayload) => void`    | All 6 captured. Receives full `captures` array. |
| `onError`     | `(message: string) => void`           | Webcam / mediapipe / runtime errors.            |
| `onLog`       | `(args: unknown) => void`             | Forwarded `console.log` from inside the page.   |

### Event payloads

```ts
type MeshCapture = {
  id: number;        // 1..6
  name: string;      // 'top-left', 'top', 'top-right', ...
  direction: string; // CaptureDirection enum value from basic-config.js
  src: string;       // 'data:image/jpeg;base64,...' (320x320, mirrored)
  index: number;     // 0..5
  total: number;     // 6
};

type MeshCompletePayload = {
  captures: Array<Pick<MeshCapture, 'id' | 'name' | 'direction' | 'src'>>;
};
```

## Why `meshHtml` is a prop

`getUserMedia` in `WKWebView` requires a secure context. We can't load `file://`. The native side reads the four web assets at app start, inlines them into one HTML document, and hands the string to JS via `initialProps`. The component then mounts the WebView with `baseUrl: 'https://faces.local/'`, which `WKWebView` treats as secure.

If you embed this component in your own app:

1. Bundle the four files in `ios/<App>/web/` (`basic.html`, `basic.css`, `basic.js`, `basic-config.js` — copied from `/mesh/` at the repo root).
2. In `AppDelegate.swift`, do what `examples/mesh/ios/FacesMesh/AppDelegate.swift` does: read each file, inject into a single HTML template, set as `initialProps["meshHtml"]`.
3. In `Info.plist`: add `NSCameraUsageDescription` and set `UIViewControllerBasedStatusBarAppearance` to `NO`.
4. Pass the prop into your screen and feed it to `<MeshCaptureCard meshHtml={meshHtml} />`.

## Build & run

```bash
cd examples/mesh
pnpm install
cd ios && pod install && cd ..
pnpm start --reset-cache         # Metro on :8081
```

Then build and install on a real device (the simulator has no camera):

```bash
xcodebuild -workspace ios/FacesMesh.xcworkspace -scheme FacesMesh \
  -configuration Debug -destination "id=<UDID>" \
  -derivedDataPath ios/build CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=<TEAM>
xcrun devicectl device install app --device <UDID> \
  /tmp/gpteen-xcode2/Prod/Debug-iphoneos/FacesMesh.app
xcrun devicectl device process launch --device <UDID> \
  --terminate-existing ai.unlikeother.facesmesh
```

The app auto-starts the camera, asks for permission once, then walks the user through the six poses.

## Files of interest

| Path                                    | What                                                |
|-----------------------------------------|-----------------------------------------------------|
| `App.tsx`                               | Wires the event handlers, renders the card.        |
| `components/MeshCaptureCard.tsx`        | Reusable component. WebView + event parser.        |
| `ios/FacesMesh/AppDelegate.swift`       | Loads `web/*` and inlines into `meshHtml`.         |
| `ios/FacesMesh/web/`                    | Verbatim copy of `/mesh/` (only place this lives). |
| `ios/FacesMesh/Info.plist`              | Camera usage string + status-bar appearance flag.  |

See [`docs/mesh-rn-example-architecture.md`](../../docs/mesh-rn-example-architecture.md) for the full architecture write-up.
