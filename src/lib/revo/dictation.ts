import { requireOptionalNativeModule } from 'expo';
import { isDevVariant } from '../variant';

type Sub = { remove(): void };

/**
 * Revo's mic (REVO-42): the speech-to-text module (expo-speech-recognition, vendored in
 * modules-dev/expo-speech-recognition), linked into Revisely Dev's builds only until the native release. Loaded
 * lazily: a build without it (the store app, an older Dev build) has none, and Revo's field shows no mic.
 */
export type Dictation = {
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(options: { lang: string; interimResults: boolean; continuous: boolean; addsPunctuation: boolean }): void;
  stop(): void;
  abort(): void;
  addListener(event: 'result', listener: (e: { isFinal: boolean; results: { transcript: string }[] }) => void): Sub;
  addListener(event: 'error', listener: (e: { error: string; message: string }) => void): Sub;
  addListener(event: 'end', listener: () => void): Sub;
};

let cached: Dictation | null | undefined;

/** The module, or null where this build has none. */
export function dictation(): Dictation | null {
  if (cached === undefined) {
    cached = isDevVariant() ? (requireOptionalNativeModule('ExpoSpeechRecognition') as unknown as Dictation | null) : null;
  }
  return cached;
}

/** What the recognizer listens for: Arabic when the app is in Arabic, else English. */
export const dictationLang = (language: string) => (language === 'ar' ? 'ar-SA' : 'en-US');

/** Tests: read the module again. */
export function resetDictationForTests() {
  cached = undefined;
}
