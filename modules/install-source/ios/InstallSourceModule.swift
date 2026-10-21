import ExpoModulesCore

// Where this copy of the app came from. TestFlight installs carry a sandbox App
// Store receipt ("sandboxReceipt"); App Store installs a production one
// ("receipt"). The same binary is both (the build tested in TestFlight is the one
// submitted), so this is how TestFlight takes its updates from the preview
// channel while the App Store keeps production (src/lib/updateChannel.ts).
//
// The receipt URL is read, not the receipt: no network, no prompt. The simulator
// and development builds have neither.

public class InstallSourceModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InstallSource")

    Function("isTestFlight") { () -> Bool in
      #if targetEnvironment(simulator)
      return false
      #else
      return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
      #endif
    }
  }
}
