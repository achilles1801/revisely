// Which features a "What's new" card may describe to an account: each feature's own gate, so a card
// shows only to accounts that have what it describes, and drops by itself while that is still for
// testers. A live release may not need a feature that is still testers only (whatsNew.test.ts).
// Since the November 2026 release every gate here is open to every account except Revo's, which
// follows its own release switch (config/app.revo, lib/revo/release).

import { useCallback } from 'react';
import type { User } from '../../types';
import type { WhatsNewNeed } from '../../lib/help/whatsNew';
import { activityBlocksEnabled } from '../../lib/activityBlocks';
import { helpAvailable } from '../../lib/help/availability';
import { sittingsEnabled } from '../../lib/sitting';
import { everyTranslationOffered } from '../../lib/translationsOffered';
import { revoAvailable } from '../../lib/revo/availability';
import { useRevoRelease, type RevoRelease } from '../../lib/revo/release';
import { reciteLiveForAccount } from '../../lib/reciteLive/availability';
import { gapsInsightsEnabled } from '../../lib/insightsGaps';

type Who = Pick<User, 'previewTester'> | null | undefined;

export function needOpen(need: WhatsNewNeed, user: Who, revo: RevoRelease): boolean {
  switch (need) {
    case 'activity':
      return activityBlocksEnabled(user);
    case 'sittings':
      // The reader's sittings (REC-1, REC-2) and the schedule editor's "Not in your plan" (MEM-6); the
      // Day's Add to memorized (MEM-5) comes with the Activity blocks.
      return sittingsEnabled(user) && activityBlocksEnabled(user);
    case 'revo':
      return revoAvailable(user, revo);
    case 'help':
      return helpAvailable(user);
    case 'translations':
      // The verse sheet's picker of every translation (TRANS-5).
      return everyTranslationOffered(user);
    case 'recite':
      // The reader's mic: Recite, Mark mistakes, Test me (RECITE-*), and what takes leave behind (RMEM-*, RINS-2).
      return reciteLiveForAccount(user);
    case 'insights':
      // Insights' Gaps and Last revised (ACT-28, ACT-30).
      return gapsInsightsEnabled(user);
    case 'reciteRevo':
      // Revo told what Recite found (RINS-1, RINS-3): both open.
      return reciteLiveForAccount(user) && revoAvailable(user, revo);
  }
}

/** needOpen under Revo's release as last read (a new function when that or the account changes). */
export function useNeedOpen(user: Who): (need: WhatsNewNeed) => boolean {
  const revo = useRevoRelease();
  const tester = user?.previewTester === true;
  return useCallback((need: WhatsNewNeed) => needOpen(need, user ? { previewTester: tester } : null, revo), [!!user, tester, revo]); // eslint-disable-line react-hooks/exhaustive-deps
}
