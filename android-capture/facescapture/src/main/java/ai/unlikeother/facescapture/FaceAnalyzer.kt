package ai.unlikeother.facescapture

import android.graphics.Bitmap
import android.graphics.Rect
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import kotlinx.coroutines.tasks.await
import kotlin.math.abs

internal class FaceAnalyzer {
    private val detector = FaceDetection.getClient(
        FaceDetectorOptions.Builder()
            .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_FAST)
            .build()
    )

    suspend fun analyze(bitmap: Bitmap, targetPose: CapturePose, previousRect: FaceRect?): CaptureState {
        val faces = detector.process(InputImage.fromBitmap(bitmap, 0)).await()
        if (faces.isEmpty()) {
            return CaptureState(targetPose = targetPose, blockReason = CaptureBlockReason.NO_FACE)
        }
        if (faces.size > 1) {
            return CaptureState(targetPose = targetPose, blockReason = CaptureBlockReason.MULTIPLE_FACES)
        }

        val face = faces.first()
        val rect = face.boundingBox.toNormalized(bitmap.width, bitmap.height)
        val insideGuide = isInsideGuide(rect)
        val lightingOk = lightingScore(bitmap) >= 0.34f
        val sharpnessOk = sharpnessScore(bitmap) >= 0.018f
        val detectedPose = detectPose(face)
        val stable = isStable(rect, previousRect, detectedPose, targetPose)

        val blockReason = when {
            !lightingOk -> CaptureBlockReason.BAD_LIGHTING
            !sharpnessOk -> CaptureBlockReason.TOO_BLURRY
            !insideGuide -> CaptureBlockReason.OUT_OF_FRAME
            detectedPose != targetPose -> CaptureBlockReason.WRONG_POSE
            !stable -> CaptureBlockReason.HOLD_STILL
            else -> CaptureBlockReason.NONE
        }

        return CaptureState(
            targetPose = targetPose,
            detectedPose = detectedPose,
            faceRect = rect,
            faceInsideGuide = insideGuide,
            lightingOk = lightingOk,
            sharpnessOk = sharpnessOk,
            stable = stable,
            canCapture = blockReason == CaptureBlockReason.NONE,
            blockReason = blockReason
        )
    }

    private fun detectPose(face: Face): CapturePose {
        val yaw = face.headEulerAngleY
        val pitch = face.headEulerAngleX

        return when {
            yaw <= -8f && pitch <= -4f -> CapturePose.LEFT_TOP
            yaw >= 8f && pitch <= -4f -> CapturePose.TOP_RIGHT
            yaw >= 8f && pitch >= 6f -> CapturePose.BOTTOM_RIGHT
            yaw <= -8f && pitch >= 6f -> CapturePose.BOTTOM_LEFT
            abs(yaw) < 8f && pitch <= -4f -> CapturePose.TOP
            else -> CapturePose.STRAIGHT
        }
    }

    private fun isInsideGuide(rect: FaceRect): Boolean {
        val centerX = rect.x + rect.width / 2f
        val centerY = rect.y + rect.height / 2f
        return rect.width in 0.22f..0.58f &&
            rect.height in 0.22f..0.70f &&
            abs(centerX - 0.5f) <= 0.18f &&
            abs(centerY - 0.5f) <= 0.18f
    }

    private fun isStable(current: FaceRect,
                         previous: FaceRect?,
                         detectedPose: CapturePose,
                         targetPose: CapturePose): Boolean {
        if (previous == null || detectedPose != targetPose) return false
        val dx = abs((current.x + current.width / 2f) - (previous.x + previous.width / 2f))
        val dy = abs((current.y + current.height / 2f) - (previous.y + previous.height / 2f))
        val ds = abs(current.width - previous.width)
        return dx < 0.03f && dy < 0.03f && ds < 0.04f
    }

    private fun lightingScore(bitmap: Bitmap): Float {
        var total = 0f
        var count = 0
        val step = 16
        for (y in 0 until bitmap.height step step) {
            for (x in 0 until bitmap.width step step) {
                val pixel = bitmap.getPixel(x, y)
                val r = (pixel shr 16 and 0xff).toFloat()
                val g = (pixel shr 8 and 0xff).toFloat()
                val b = (pixel and 0xff).toFloat()
                total += (0.299f * r + 0.587f * g + 0.114f * b) / 255f
                count++
            }
        }
        return if (count == 0) 0f else total / count
    }

    private fun sharpnessScore(bitmap: Bitmap): Float {
        var total = 0f
        var count = 0
        val step = 20
        for (y in 0 until bitmap.height - step step step) {
            for (x in 0 until bitmap.width - step step step) {
                val p1 = bitmap.getPixel(x, y)
                val p2 = bitmap.getPixel(x + step, y)
                val p3 = bitmap.getPixel(x, y + step)
                val l1 = luma(p1)
                val l2 = luma(p2)
                val l3 = luma(p3)
                total += abs(l1 - l2) + abs(l1 - l3)
                count += 2
            }
        }
        return if (count == 0) 0f else (total / count) / 255f
    }

    private fun luma(pixel: Int): Float {
        val r = (pixel shr 16 and 0xff).toFloat()
        val g = (pixel shr 8 and 0xff).toFloat()
        val b = (pixel and 0xff).toFloat()
        return 0.299f * r + 0.587f * g + 0.114f * b
    }

    private fun Rect.toNormalized(width: Int, height: Int) = FaceRect(
        x = left.toFloat() / width,
        y = top.toFloat() / height,
        width = this.width().toFloat() / width,
        height = this.height().toFloat() / height,
    )
}
