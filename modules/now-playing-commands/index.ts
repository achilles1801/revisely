import { NativeModule, requireOptionalNativeModule } from 'expo';

type Events = { onRemoteCommand: (event: { command: 'next' | 'previous' }) => void };

declare class NowPlayingCommandsModule extends NativeModule<Events> {
  /** Show (or hide) previous and next on the lock screen and in Control Center. */
  setEnabled(enabled: boolean): void;
}

/** Null where the native module isn't built in (Android, web, tests, builds before 1.0.2's last). */
export default requireOptionalNativeModule<NowPlayingCommandsModule>('NowPlayingCommands');
