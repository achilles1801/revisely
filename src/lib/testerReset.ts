// Settings → Reset my data (testers): the account starts again as new, and so
// does this phone's part of it.
//
// The server does the reset (functions resetMyData: previewTester only, a
// backup first, then sign-up's defaults with a new `dataResetAt`). Meanwhile
// nothing is sent from the outbox (a change sent half way through would land in
// the new account). Once it has answered:
//   - the outbox goes: everything in it was made before the reset;
//   - this phone's recordings go, as account deletion does (their backup is
//     already gone on the server, their records tombstones);
//   - the copy of the account goes when the user document arrives with the new
//     mark (AppProvider, lib/offline/reset), and with onboarding not done, the
//     app shows onboarding. The sign-in stays.
// If the server refuses or fails, nothing on the phone is cleared.

import * as firestoreService from '../services/firestoreService';
import type { TesterResetResult } from '../services/firestoreService';
import { clearOutbox } from './offline/outbox';
import { settleSync } from './offline/sync';
import { deleteAllRecordings, forgetCloudDeletes } from './recordings';
import { auth } from './firebase';
import { logger } from './logger';

/** Who sees Reset my data: a previewTester account, as the server requires. */
export function showsResetMyData(user: { previewTester?: boolean } | null | undefined): boolean {
  return user?.previewTester === true;
}

export async function resetMyData(): Promise<TesterResetResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not signed in.');
  firestoreService.setResettingAccount(uid);
  try {
    // A change on its way finishes first; no other starts until this is over.
    await settleSync(uid);
    const result = await firestoreService.resetMyDataOnServer();
    await clearOutbox(uid);
    try {
      await deleteAllRecordings(uid);
      forgetCloudDeletes(uid);
    } catch (err) {
      logger.warn('Could not clear this phone’s recordings after a reset', err);
    }
    logger.log('Tester reset done', { backup: result.backup.location, deleted: result.deleted });
    return result;
  } finally {
    firestoreService.setResettingAccount(null);
  }
}
