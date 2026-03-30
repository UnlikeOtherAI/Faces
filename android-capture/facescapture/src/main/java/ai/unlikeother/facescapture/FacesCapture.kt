package ai.unlikeother.facescapture

import android.content.Context
import android.graphics.Bitmap
import androidx.camera.view.PreviewView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileOutputStream

object FacesCapture {
    var onCaptureState: ((CaptureState) -> Unit)? = null

    private lateinit var appContext: Context
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    private val analyzer = FaceAnalyzer()
    private lateinit var camera: CameraEngine
    private var targetPose: CapturePose = CapturePose.LEFT_TOP
    private var latestBitmap: Bitmap? = null
    private var latestState: CaptureState = CaptureState(targetPose = CapturePose.LEFT_TOP)
    private var previousRect: FaceRect? = null

    fun start(context: Context) {
        appContext = context.applicationContext
        if (!::camera.isInitialized) {
            camera = CameraEngine(appContext)
            camera.onFrame = { bitmap ->
                latestBitmap = bitmap
                scope.launch {
                    val state = analyzer.analyze(bitmap, targetPose, previousRect)
                    previousRect = state.faceRect
                    latestState = state
                    onCaptureState?.invoke(state)
                }
            }
        }
        camera.start()
        onCaptureState?.invoke(latestState)
    }

    fun stop() {
        if (::camera.isInitialized) {
            camera.stop()
        }
    }

    fun attachPreviewView(view: PreviewView) {
        if (!::camera.isInitialized) {
            camera = CameraEngine(appContext)
        }
        camera.attachPreviewView(view)
    }

    fun setTargetPose(pose: CapturePose) {
        targetPose = pose
        latestState = latestState.copy(
            targetPose = pose,
            canCapture = latestState.canCapture && latestState.detectedPose == pose,
            blockReason = if (latestState.detectedPose == pose) latestState.blockReason else CaptureBlockReason.WRONG_POSE
        )
        onCaptureState?.invoke(latestState)
    }

    fun capturePhoto(targetPose: CapturePose): Result<String> {
        if (!latestState.canCapture || latestState.targetPose != targetPose) {
            return Result.failure(IllegalStateException("Capture is not ready for the requested pose."))
        }
        val bitmap = latestBitmap ?: return Result.failure(IllegalStateException("No camera frame is available yet."))
        val dir = File(appContext.filesDir, "facescapture/captures").also { it.mkdirs() }
        val file = File(dir, "${System.currentTimeMillis()}.jpg")
        FileOutputStream(file).use { bitmap.compress(Bitmap.CompressFormat.JPEG, 92, it) }
        return Result.success("file://${file.absolutePath}")
    }
}
