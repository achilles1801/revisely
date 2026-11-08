// Which features a "What's new" card may describe to an account: each feature's own gate, so a card
// shows only to accounts that have what it describes, and drops by itself while that is still for
// testers. A live release may not need a feature that is still testers only (whatsNew.test.ts).

import { useCallback } from 'react';
import type { User } from '../../types';
import type { WhatsNewNeed } from '../../lib/help/whatsNew';
import { activityBlocksEnabled } from '../../lib/activityBlocks';
import { helpAvailable } from '../../lib/help/availability';
import { revoAvailable } from '../../lib/revo/availability';
import { useRevoRelease, type RevoRelease } from '../../lib/revo/release';

type Who = Pick<User, 'previewTester'> | null | undefined;

export function needOpen(need: WhatsNewNeed, user: Who, revo: RevoRelease): boolean {
  switch (need) {
    case 'activity':
      return activityBlocksEnabled(user);
    case 'sittings':
      // QuranReaderScreen's `sittings` (REC-1) and the Day's Add to memorized (MEM-5): testers.
      return user?.previewTester === true;
    case 'revo':
      return revoAvailable(user, revo);
    case 'help':
      return helpAvailable(user);
    case 'translations':
      // The verse sheet offers every translation to testers (offeredTranslations, TRANS-5).
      return user?.previewTester === true;
  }
}

/** needOpen under Revo's release as last read (a new function when that or the account changes). */
export function useNeedOpen(user: Who): (need: WhatsNewNeed) => boolean {
  const revo = useRevoRelease();
  const tester = user?.previewTester === true;
  return useCallback((need: WhatsNewNeed) => needOpen(need, user ? { previewTester: tester } : null, revo), [!!user, tester, revo]); // eslint-disable-line react-hooks/exhaustive-deps
}
