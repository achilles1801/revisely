// A test-only preview of The Clear Quran, for screenshots of how the app credits
// it before its text is available (the publisher asks for them). With it on, The
// Clear Quran can be chosen in the translation picker and the verse sheet shows
// a labelled placeholder instead of a translation, with the credit line: never
// another translation's text under its name.
//
// Only where `allowed` (lib/releaseInfo: a development build, or a preview-tester
// account on the preview channel, i.e. TestFlight testers): never on the App
// Store's production channel. Off unless turned on (Settings → About → App info).

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ReleaseInfo } from './releaseInfo';

const KEY = '@revisely_clear_quran_preview';

export const CLEAR_QURAN_PLACEHOLDER = '[The Clear Quran® translation will appear here]';

let allowed = false;
let on = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Where the preview may be used: a development build, or a tester account on the preview channel. */
export function clearQuranPreviewAllowed(release: ReleaseInfo, previewTester: boolean | undefined): boolean {
  return release.isDev || (release.channel === 'preview' && previewTester === true);
}

/** The preview is on (and allowed). */
export function isClearQuranPreview(): boolean {
  return allowed && on;
}

/** Whether this install may use the preview; read the saved switch if so. */
export async function initClearQuranPreview(isAllowed: boolean): Promise<void> {
  allowed = isAllowed;
  on = isAllowed ? (await AsyncStorage.getItem(KEY).catch(() => null)) === 'true' : false;
  notify();
}

/** The switch (does nothing where the preview isn't allowed). */
export function setClearQuranPreview(value: boolean): void {
  if (!allowed) return;
  on = value;
  AsyncStorage.setItem(KEY, value ? 'true' : 'false').catch(() => undefined);
  notify();
}

/** Re-renders when the preview turns on or off. */
export function useClearQuranPreview(): boolean {
  const [value, setValue] = useState(isClearQuranPreview());
  useEffect(() => {
    const listener = () => setValue(isClearQuranPreview());
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}

/** For tests. */
export function resetClearQuranPreviewForTests(): void {
  allowed = false;
  on = false;
}
