package ai.unlikeother.facesmesh

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
    override fun getMainComponentName(): String = "FacesMesh"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        object : DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled) {
            override fun getLaunchOptions(): Bundle = Bundle().apply {
                putString("meshHtml", buildMeshHtml())
            }
        }

    private fun buildMeshHtml(): String {
        val css = loadAsset("web/basic.css")
        val config = loadAsset("web/basic-config.js")
        val js = loadAsset("web/basic.js")
        return """<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Face Recognition Setup</title>
  <style>$css</style>
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
  <script>$config</script>
  <script>$js</script>
</body>
</html>"""
    }

    private fun loadAsset(path: String): String =
        assets.open(path).bufferedReader().use { it.readText() }
}
