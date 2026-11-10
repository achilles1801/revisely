import { NativeModule, requireOptionalNativeModule } from 'expo';

declare class AndroidWidgetsModule extends NativeModule {
  /** Keeps a value for the widgets (the snapshot JSON, under `widget.snapshot`). */
  set(key: string, value: string): void;
  /** Redraws every Revisely widget on the home screen and sets the next alarm (off the JS thread). */
  reload(): void;
}

/**
 * The Android home-screen widgets (Today, Verse of the day, Qibla, Prayer times): native
 * RemoteViews that read the snapshot themselves, so they move on with the app closed.
 * Null where it isn't built in (iOS, tests, Android binaries before 1.0.4).
 */
export default requireOptionalNativeModule<AndroidWidgetsModule>('AndroidWidgets');
