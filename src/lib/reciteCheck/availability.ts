import { isDevVariant } from '../variant';
import { isMicStreamAvailable } from '../recite/micSource';

/**
 * The recitation check (the lab's mistake detection, served from revisely-dev; scripts/recite-check) is in the
 * Revisely Dev app only, for previewTester accounts, on a binary that can stream the microphone (iOS). The store
 * app never shows it: its JavaScript is the same, but `isDevVariant()` is false there.
 */
export function reciteCheckEnabled(user: { previewTester?: boolean } | null | undefined): boolean {
  return isDevVariant() && user?.previewTester === true && isMicStreamAvailable();
}
