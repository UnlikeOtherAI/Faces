package ai.unlikeother.faceskit

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.tasks.await

internal class FaceDetector {
    private val options = FaceDetectorOptions.Builder()
        .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
        .build()
    private val detector = FaceDetection.getClient(options)

    suspend fun detectAndCrop(bitmap: Bitmap): Bitmap? {
        val image = InputImage.fromBitmap(bitmap, 0)
        val faces = detector.process(image).await()
        val face = faces.firstOrNull() ?: return null
        val box = paddedBox(face.boundingBox, bitmap.width, bitmap.height, 0.20f)
        val crop = Bitmap.createBitmap(bitmap, box.left, box.top, box.width(), box.height())
        return Bitmap.createScaledBitmap(crop, 112, 112, true)
    }

    private fun paddedBox(rect: Rect, w: Int, h: Int, pad: Float): Rect {
        val p = (maxOf(rect.width(), rect.height()) * pad).toInt()
        return Rect(
            maxOf(0, rect.left - p), maxOf(0, rect.top - p),
            minOf(w, rect.right + p), minOf(h, rect.bottom + p)
        )
    }
}
