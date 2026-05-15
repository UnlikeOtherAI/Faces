import UIKit
import React
import React_RCTAppDelegate

@main
class AppDelegate: RCTAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    self.moduleName = "FacesMesh"
    self.initialProps = [
      "meshHtml": Self.buildMeshHtml(),
    ]
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bundleURL()
  }

  func bundleURL() -> URL? {
#if DEBUG && targetEnvironment(simulator)
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }

  private static func loadWeb(_ name: String, _ ext: String) -> String {
    guard
      let url = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "web"),
      let data = try? String(contentsOf: url, encoding: .utf8)
    else { return "" }
    return data
  }

  private static func buildMeshHtml() -> String {
    let css = loadWeb("basic", "css")
    let config = loadWeb("basic-config", "js")
    let js = loadWeb("basic", "js")
    return """
    <!doctype html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
      <title>Face Recognition Setup</title>
      <style>\(css)</style>
    </head>
    <body>
      <main>
        <button class="close-button" type="button" aria-label="Close">×</button>
        <section class="face-capture-card" aria-label="Guided face capture">
          <canvas id="meshCanvas" width="640" height="640"></canvas>
          <h1 class="title">Set Up Your Face Recognition</h1>
          <div class="progress" id="progressLabel">0%</div>
          <p class="status" id="statusLabel">Move your head slowly around</p>
          <div class="captures" id="captureStrip" aria-live="polite"></div>
        </section>
        <button class="primary-action" id="primaryButton" type="button">Get Started</button>
        <div class="controls">
          <button id="centerButton" type="button" disabled>Set Straight</button>
        </div>
        <section class="debug-panel" aria-label="Debug values">
          <button class="debug-copy" id="copyDebugButton" type="button">Copy Debug Values</button>
          <pre class="debug" id="debugLabel">debug: waiting for webcam</pre>
        </section>
        <video id="inputVideo" autoplay playsinline muted></video>
      </main>
      <script src="https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js"></script>
      <script src="https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js"></script>
      <script>\(config)</script>
      <script>\(js)</script>
    </body>
    </html>
    """
  }
}
