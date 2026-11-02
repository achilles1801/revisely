import { NativeModule, requireOptionalNativeModule } from 'expo';

export type RecitationAudioEvents = {
  /** A buffer of 16 kHz mono 16-bit PCM (base64) and its loudness in dBFS. */
  onAudio: (event: { data: string; level: number }) => void;
  /** Capture ended by itself: 'interrupted' (a call, Siri) or 'route' (headphones). */
  onStop: (event: { reason: 'interrupted' | 'route' }) => void;
};

declare class RecitationAudioModule extends NativeModule<RecitationAudioEvents> {
  /** Start the microphone. The audio session must be in recording mode. */
  start(): Promise<void>;
  stop(): Promise<void>;
  isCapturing(): boolean;
  /** Keep a file (by path) out of iCloud backups. */
  excludeFromBackup(path: string): void;
}

/** Null where the native module isn't built in (Android, web, tests, older binaries). */
export default requireOptionalNativeModule<RecitationAudioModule>('RecitationAudio');
