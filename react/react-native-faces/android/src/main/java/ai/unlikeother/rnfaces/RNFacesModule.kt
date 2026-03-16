package ai.unlikeother.rnfaces

import ai.unlikeother.faceskit.FacesKit
import ai.unlikeother.faceskit.MatchResult
import android.graphics.BitmapFactory
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class RNFacesModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "RNFaces"

    private fun emit(name: String, params: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, params)
    }

    @ReactMethod fun addListener(eventType: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod
    fun startRecognition(promise: Promise) {
        FacesKit.onMatch = { match: MatchResult ->
            val map = Arguments.createMap().apply {
                putString("workerId",   match.worker.id)
                putString("workerName", match.worker.name)
                putDouble("score",      match.score.toDouble())
                putDouble("latencyMs",  match.latencyMs.toDouble())
            }
            emit("onFaceRecognized", map)
        }
        FacesKit.start(reactContext)
        promise.resolve(null)
    }

    @ReactMethod
    fun stopRecognition(promise: Promise) {
        FacesKit.stop()
        promise.resolve(null)
    }

    @ReactMethod
    fun registerWorker(workerId: String, name: String,
                       photos: ReadableArray, promise: Promise) {
        val bitmaps = (0 until photos.size()).mapNotNull { i ->
            val path = photos.getString(i)?.removePrefix("file://")
                ?: return@mapNotNull null
            BitmapFactory.decodeFile(path)
        }
        FacesKit.register(workerId, name, bitmaps) { result ->
            result.fold(
                onSuccess = { promise.resolve(null) },
                onFailure = { promise.reject("REGISTER_ERROR", it) }
            )
        }
    }

    @ReactMethod
    fun deleteWorker(workerId: String, promise: Promise) {
        FacesKit.delete(workerId)
        promise.resolve(null)
    }

    @ReactMethod
    fun getWorkers(promise: Promise) {
        val arr = Arguments.createArray()
        FacesKit.workers().forEach { w ->
            arr.pushMap(Arguments.createMap().apply {
                putString("id",          w.id)
                putString("name",        w.name)
                putDouble("lastUpdated", w.lastUpdated.toDouble())
            })
        }
        promise.resolve(arr)
    }
}
