package ai.unlikeother.rnfacescapture

import androidx.camera.view.PreviewView
import ai.unlikeother.facescapture.FacesCapture
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.NativeModule
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager

class RNFacesCapturePackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext): List<NativeModule> =
        listOf(RNFacesCaptureModule(ctx))

    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        listOf(RNFacesCaptureViewManager())
}

class RNFacesCaptureViewManager : SimpleViewManager<View>() {
    override fun getName() = "RNFacesCaptureView"

    override fun createViewInstance(reactContext: ThemedReactContext): View =
        PreviewView(reactContext).apply {
            FacesCapture.start(reactContext)
            FacesCapture.attachPreviewView(this)
        }
}
