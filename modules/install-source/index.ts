import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class InstallSourceModule extends NativeModule {
  /** Installed from TestFlight (false on the App Store, the simulator and dev builds). */
  isTestFlight(): boolean;
}

/** Null where the native module isn't built in (Android, web, tests, binaries before 1.0.2). */
export default requireOptionalNativeModule<InstallSourceModule>('InstallSource');
