package ai.unlikeother.faceskit

import android.content.Context
import android.graphics.Bitmap
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

internal class CameraEngine(private val context: Context) {
    var onFrame: ((Bitmap) -> Unit)? = null
    private val executor: ExecutorService = Executors.newSingleThreadExecutor()

    fun start() {
        val future = ProcessCameraProvider.getInstance(context)
        future.addListener({
            val provider = future.get()
            val analysis = ImageAnalysis.Builder()
                .setTargetResolution(android.util.Size(640, 480))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build()
            analysis.setAnalyzer(executor) { imageProxy ->
                val bitmap = imageProxy.toBitmap()
                imageProxy.close()
                onFrame?.invoke(bitmap)
            }
            val selector = CameraSelector.DEFAULT_FRONT_CAMERA
            try {
                provider.unbindAll()
                provider.bindToLifecycle(
                    androidx.lifecycle.ProcessLifecycleOwner.get(), selector, analysis
                )
            } catch (_: Exception) {}
        }, ContextCompat.getMainExecutor(context))
    }

    fun stop() { executor.shutdown() }
}
