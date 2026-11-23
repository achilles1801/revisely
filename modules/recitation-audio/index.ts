import { NativeModule, requireOptionalNativeModule } from 'expo';

export type RecitationAudioEvents = {
  /** A buffer of 16 kHz mono 16-bit PCM (base64) and its loudness in dBFS. */
  onAudio: (event: { data: string; level: number }) => void;
  /** Capture ended by itself: 'interrupted' (a call, Siri; on Android another app taking the mic) or 'route' (headphones, the input gone). */
  onStop: (event: { reason: 'interrupted' | 'route' }) => void;
};

declare class RecitationAudioModule extends NativeModule<RecitationAudioEvents> {
  /** Start the microphone. The audio session must be in recording mode. */
  start(): Promise<void>;
  stop(): Promise<void>;
  isCapturing(): boolean;
  /** Keep a file (by path) out of iCloud backups (iOS; on Android the backup rules do it, so it does nothing). */
  excludeFromBackup(path: string): void;
}

/** Null where the native module isn't built in (web, tests, binaries before it: Android before 1.0.5). */
export default requireOptionalNativeModule<RecitationAudioModule>('RecitationAudio');
