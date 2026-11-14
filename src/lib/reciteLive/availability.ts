import { mushafEdition, MushafEditionId } from '../mushafEdition';
import { isDevVariant } from '../variant';
import { isMicStreamAvailable } from '../recite/micSource';

/** E2E builds: the live check without the Dev app, a microphone or the checker (lib/e2e/reciteLive). Others: never. */
export function e2eReciteLive(): boolean {
  return process.env.EXPO_PUBLIC_E2E === '1'
    ? (require('../e2e/reciteLive') as typeof import('../e2e/reciteLive')).e2eReciteLiveOn()
    : false;
}

/**
 * The reader's one mic (Record, Recite, Mark mistakes) and following along on the page: Revisely Dev only, previewTester
 * accounts, a binary that streams the microphone (iOS), and the print with word boxes (the 1405 pages). Everyone
 * else keeps today's record button; the store app never shows it (`isDevVariant()` is false there).
 */
export function reciteLiveEnabled(user: { previewTester?: boolean } | null | undefined, edition: MushafEditionId): boolean {
  return reciteLiveForAccount(user) && mushafEdition(edition).reciteData;
}

/** The account side of it, whatever print is chosen (Settings' Recite rows). */
export function reciteLiveForAccount(user: { previewTester?: boolean } | null | undefined): boolean {
  const e2e = e2eReciteLive();
  return (isDevVariant() || e2e) && user?.previewTester === true && (isMicStreamAvailable() || e2e);
}
