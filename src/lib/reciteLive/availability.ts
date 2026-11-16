import { mushafEdition, MushafEditionId } from '../mushafEdition';
import { isDevVariant } from '../variant';
import { isMicStreamAvailable } from '../recite/micSource';
import { mistakeDetectionReleased } from '../release/mistakeDetection';

/** E2E builds: the live check without the Dev app, a microphone or the checker (lib/e2e/reciteLive). Others: never. */
export function e2eReciteLive(): boolean {
  return process.env.EXPO_PUBLIC_E2E === '1'
    ? (require('../e2e/reciteLive') as typeof import('../e2e/reciteLive')).e2eReciteLiveOn()
    : false;
}

/**
 * The reader's one mic (Record, Recite, Mark mistakes) and following along on the page: a binary that streams the
 * microphone (iOS; Android from 1.0.5) and the print with word boxes (the 1405 pages); until the mistake detection
 * release is switched on (lib/release/mistakeDetection), Revisely Dev's previewTester accounts only. Everyone else
 * keeps today's record button; the store app never shows it before then (`isDevVariant()` is false there).
 */
export function reciteLiveEnabled(user: { previewTester?: boolean } | null | undefined, edition: MushafEditionId): boolean {
  return reciteLiveForAccount(user) && mushafEdition(edition).reciteData;
}

/** The account side of it, whatever print is chosen (Settings' Recite rows). */
export function reciteLiveForAccount(user: { previewTester?: boolean } | null | undefined): boolean {
  const e2e = e2eReciteLive();
  const mic = isMicStreamAvailable() || e2e;
  if (mistakeDetectionReleased()) return user != null && mic;
  return (isDevVariant() || e2e) && user?.previewTester === true && mic;
}
