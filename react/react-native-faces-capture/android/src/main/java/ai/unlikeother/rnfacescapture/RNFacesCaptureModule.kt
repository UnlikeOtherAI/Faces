package ai.unlikeother.rnfacescapture

import ai.unlikeother.facescapture.CaptureBlockReason
import ai.unlikeother.facescapture.CapturePose
import ai.unlikeother.facescapture.CaptureState
import ai.unlikeother.facescapture.FacesCapture
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class RNFacesCaptureModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "RNFacesCapture"

    private fun emitState(state: CaptureState) {
        val map = Arguments.createMap().apply {
            putString("targetPose", state.targetPose.wireValue)
            state.detectedPose?.let { putString("detectedPose", it.wireValue) }
            state.faceRect?.let {
                putMap("faceRect", Arguments.createMap().apply {
                    putDouble("x", it.x.toDouble())
                    putDouble("y", it.y.toDouble())
                    putDouble("width", it.width.toDouble())
                    putDouble("height", it.height.toDouble())
                })
            }
            putBoolean("faceInsideGuide", state.faceInsideGuide)
            putBoolean("lightingOk", state.lightingOk)
            putBoolean("sharpnessOk", state.sharpnessOk)
            putBoolean("stable", state.stable)
            putBoolean("canCapture", state.canCapture)
            putString("blockReason", state.blockReason.wireValue)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onCaptureState", map)
    }

    @ReactMethod fun addListener(eventType: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    @ReactMethod
    fun startGuidedCapture(promise: Promise) {
        FacesCapture.onCaptureState = { state -> emitState(state) }
        FacesCapture.start(reactContext)
        promise.resolve(null)
    }

    @ReactMethod
    fun stopGuidedCapture(promise: Promise) {
        FacesCapture.stop()
        promise.resolve(null)
    }

    @ReactMethod
    fun setTargetPose(targetPose: String, promise: Promise) {
        val pose = CapturePose.entries.firstOrNull { it.wireValue == targetPose }
        if (pose == null) {
            promise.reject("INVALID_POSE", "Unknown capture pose: $targetPose")
            return
        }
        FacesCapture.setTargetPose(pose)
        promise.resolve(null)
    }

    @ReactMethod
    fun capturePhoto(targetPose: String, promise: Promise) {
        val pose = CapturePose.entries.firstOrNull { it.wireValue == targetPose }
        if (pose == null) {
            promise.reject("INVALID_POSE", "Unknown capture pose: $targetPose")
            return
        }
        FacesCapture.capturePhoto(pose).fold(
            onSuccess = { promise.resolve(it) },
            onFailure = { promise.reject("CAPTURE_NOT_IMPLEMENTED", it) }
        )
    }
}
