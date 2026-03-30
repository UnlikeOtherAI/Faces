package ai.unlikeother.facescapture

import android.content.Context
import android.graphics.Bitmap
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.ProcessLifecycleOwner
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

internal class CameraEngine(private val context: Context) {
    var onFrame: ((Bitmap) -> Unit)? = null

    private val executor: ExecutorService = Executors.newSingleThreadExecutor()
    private var previewView: PreviewView? = null
    private var provider: ProcessCameraProvider? = null
    private var analysis: ImageAnalysis? = null
    private var preview: Preview? = null

    fun attachPreviewView(view: PreviewView) {
        previewView = view
        bindIfPossible()
    }

    fun start() {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            provider = future.get()
            bindIfPossible()
        }, ContextCompat.getMainExecutor(context))
    }

    fun stop() {
        provider?.unbindAll()
    }

    private fun bindIfPossible() {
        val provider = provider ?: return
        val previewView = previewView

        if (analysis == null) {
            analysis = ImageAnalysis.Builder()
                .setTargetResolution(android.util.Size(640, 480))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build().also { analysis ->
                    analysis.setAnalyzer(executor) { imageProxy ->
                        val bitmap = imageProxy.toBitmap()
                        imageProxy.close()
                        onFrame?.invoke(bitmap)
                    }
                }
        }

        if (preview == null) {
            preview = Preview.Builder().build()
        }

        try {
            provider.unbindAll()
            if (previewView != null) {
                preview?.setSurfaceProvider(previewView.surfaceProvider)
                provider.bindToLifecycle(
                    ProcessLifecycleOwner.get(),
                    CameraSelector.DEFAULT_FRONT_CAMERA,
                    preview,
                    analysis
                )
            } else {
                provider.bindToLifecycle(
                    ProcessLifecycleOwner.get(),
                    CameraSelector.DEFAULT_FRONT_CAMERA,
                    analysis
                )
            }
        } catch (_: Exception) {
        }
    }
}
