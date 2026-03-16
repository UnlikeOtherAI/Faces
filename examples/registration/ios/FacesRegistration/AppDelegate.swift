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
    // Set the Metro packager host. Change via Xcode scheme args (-jsLocation <host>)
    // or the in-app Dev Menu → Configure Bundler to override.
    // Default: Mac's WiFi IP. For USB+Xcode use "localhost" (LLDB tunnels the port).
    RCTBundleURLProvider.sharedSettings().jsLocation = "192.168.1.229"
    #endif
    self.moduleName = "FacesRegistration"
    self.initialProps = [:]
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  override func sourceURL(for bridge: RCTBridge) -> URL? {
    bundleURL()
  }

  func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
