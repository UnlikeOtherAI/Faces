package ai.unlikeother.rnfaces

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class RNFacesPackage : ReactPackage {
    override fun createNativeModules(ctx: ReactApplicationContext) =
        listOf(RNFacesModule(ctx))
    override fun createViewManagers(ctx: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
