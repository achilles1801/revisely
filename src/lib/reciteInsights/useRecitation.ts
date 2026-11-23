// The account's takes with Mark mistakes and the word data, for Insights' Recitation section (Revisely Dev, RINS-2):
// only for an account that recites (`reciteLiveForAccount`) and has kept a take; null otherwise, so nothing shows.

import { useEffect, useMemo, useState } from 'react';
import { logger } from '../logger';
import { getQuranWords, loadQuranWords, type QuranWords } from '../recite/quranWords';
import { reciteLiveForAccount } from '../reciteLive/availability';
import type { MemoryRecord } from '../reciteMemory/record';
import { useMemoryRecords } from '../reciteMemory/store';
import { liveTakes } from './insights';

export interface Recitation {
  records: readonly MemoryRecord[];
  /** Null until the word data has loaded (the words' Arabic on their highlights). */
  words: QuranWords | null;
}

export function useRecitation(user: { id?: string; previewTester?: boolean } | null | undefined): Recitation | null {
  const on = reciteLiveForAccount(user);
  const records = useMemoryRecords(user?.id, on);
  const any = useMemo(() => liveTakes(records).length > 0, [records]);
  const [words, setWords] = useState<QuranWords | null>(getQuranWords());
  useEffect(() => {
    if (!on || !any || words) return;
    let alive = true;
    loadQuranWords()
      .then((w) => {
        if (alive) setWords(w);
      })
      .catch((err) => logger.warn('Recite insights: the word data did not load', err));
    return () => {
      alive = false;
    };
  }, [on, any, words]);
  return useMemo(() => (on && any ? { records, words } : null), [on, any, records, words]);
}
