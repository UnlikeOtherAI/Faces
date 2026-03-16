package ai.unlikeother.faceskit

import android.content.Context
import android.graphics.Bitmap
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.FileInputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.channels.FileChannel

internal class FaceEmbedder(context: Context) {
    private val interpreter: Interpreter

    init {
        val assetFd = context.assets.openFd("mobilefacenet.tflite")
        val inputStream = FileInputStream(assetFd.fileDescriptor)
        val buffer = inputStream.channel.map(
            FileChannel.MapMode.READ_ONLY, assetFd.startOffset, assetFd.declaredLength
        )
        val options = Interpreter.Options().apply {
            try { addDelegate(GpuDelegate()) } catch (_: Exception) {}
            numThreads = 2
        }
        interpreter = Interpreter(buffer, options)
    }

    fun embed(bitmap: Bitmap): FloatArray {
        val input = bitmapToBuffer(bitmap)
        val output = Array(1) { FloatArray(128) }
        interpreter.run(input, output)
        return output[0]
    }

    private fun bitmapToBuffer(bitmap: Bitmap): ByteBuffer {
        val buf = ByteBuffer.allocateDirect(1 * 112 * 112 * 3 * 4)
        buf.order(ByteOrder.nativeOrder())
        val pixels = IntArray(112 * 112)
        bitmap.getPixels(pixels, 0, 112, 0, 0, 112, 112)
        for (px in pixels) {
            buf.putFloat(((px shr 16 and 0xFF) - 127.5f) / 128f)
            buf.putFloat(((px shr 8  and 0xFF) - 127.5f) / 128f)
            buf.putFloat(((px        and 0xFF) - 127.5f) / 128f)
        }
        return buf
    }
}
