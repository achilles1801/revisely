// Saving the memorized pages' drafts, for both editors (the store app's Memorization and the Settings-style one, MEM-9).
// Pages newly marked are logged for Today (one dated memorization item for the day) or not logged (Before); unmarked pages
// come out of the items that hold them; a custom plan drops pages no longer memorized.

import { useState } from 'react';
import { Alert } from 'react-native';
import { applyPendingChanges, applyPendingSurahChanges, pruneCustomPlanForMemorized, type PageStatus } from '../lib/memorizationChanges';
import { defaultWhen, memorizationChangeSet, type WhenMemorized } from '../lib/memorizationLog';
import { queueChange } from '../lib/offline/queue';
import { getRevisionDayForUser } from '../lib/fajrBoundary';
import { revisablePages } from '../lib/memorizedAyahs';
import { useApp } from '../context/AppContext';
import type { User } from '../types';
import { t } from '../i18n';

export interface MemorizationDrafts {
  pages: Map<number, PageStatus>;
  surahs: Map<number, PageStatus>;
}

export function useSaveMemorization() {
  const { user, pages, updatePages, saveUser } = useApp();
  const [saving, setSaving] = useState(false);

  /** Saves the drafts; resolves with whether anything changed (so a custom plan's review can follow). */
  const commit = async (drafts: MemorizationDrafts, when: WhenMemorized | null): Promise<boolean> => {
    setSaving(true);
    try {
      const { updatedPages, changedPageNumbers } = applyPendingChanges(pages, drafts.pages);
      const { marked, unmarked } = memorizationChangeSet(pages, drafts.pages);
      if (changedPageNumbers.length > 0) {
        await updatePages(updatedPages, changedPageNumbers);
      }
      if (when === 'today' && marked.length > 0 && user) {
        await queueChange({ kind: 'memorization.mark', day: getRevisionDayForUser(user), pages: marked, at: Date.now() });
      }
      if (unmarked.length > 0) {
        await queueChange({ kind: 'memorization.unmark', pages: unmarked });
      }
      if (user) {
        const userUpdates: Partial<User> = {};
        if (drafts.surahs.size > 0) {
          userUpdates.memorizedSurahs = applyPendingSurahChanges(user.memorizedSurahs ?? [], drafts.surahs);
        }
        // Strip un-memorized pages from the custom plan so the schedule doesn't surface pages the user no longer knows.
        // Newly memorized pages aren't added: the user slots those in the plan editor.
        if (user.customPlan) {
          const memorizedNumbers = revisablePages(updatedPages).map((p) => p.pageNumber);
          userUpdates.customPlan = pruneCustomPlanForMemorized(user.customPlan, memorizedNumbers).plan;
        }
        if (Object.keys(userUpdates).length > 0) {
          await saveUser({ ...user, ...userUpdates });
        }
      }
      return changedPageNumbers.length > 0 || drafts.surahs.size > 0;
    } finally {
      setSaving(false);
    }
  };

  /**
   * Asks "When did you memorize these?" when pages were newly marked (Today or Before, in the order defaultWhen
   * suggests), then saves; with none marked it saves at once. `done` gets whether anything changed.
   */
  const save = (drafts: MemorizationDrafts, done: (changed: boolean) => void) => {
    const { marked } = memorizationChangeSet(pages, drafts.pages);
    const go = (when: WhenMemorized) => void commit(drafts, when).then(done);
    if (marked.length === 0) {
      go('before');
      return;
    }
    const today = { text: t('common.today'), onPress: () => go('today') };
    const before = { text: t('memorization.screen.before'), onPress: () => go('before') };
    const cancel = { text: t('common.cancel'), style: 'cancel' as const };
    Alert.alert(
      t('memorization.screen.whenTitle'),
      t('memorization.screen.marked', { count: marked.length }),
      defaultWhen(marked) === 'today' ? [today, before, cancel] : [before, today, cancel],
    );
  };

  return { save, saving, hasCustomPlan: !!user?.customPlan };
}
