import UIKit
import React
import React_RCTAppDelegate

#if DEBUG
import AppReveal
#endif

@main
class AppDelegate: RCTAppDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    #if DEBUG
    AppReveal.start()
    #endif
    self.moduleName = "FacesDebug"
    self.initialProps = [:]
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }
}
