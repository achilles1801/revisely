import { useEffect, useState } from 'react';
import { listRecordings, type RecordingMeta } from '../recordings';
import { logger } from '../logger';
import * as firestoreService from '../../services/firestoreService';
import { withPendingJournal, withPendingReadings } from '../offline/queue';
import type { JournalEntry, ReadingSession } from '../../types';
import type { DayExtras } from './facts';

/**
 * What a day's facts read beyond the logs: the daily log, the timer's readings and this phone's
 * recordings, as Activity reads them (changes still on their way included). Null until loaded;
 * each source that fails is null in it, so its fact is sent as not known.
 */
export function useDayExtras(enabled = true): DayExtras | null {
  const [extras, setExtras] = useState<DayExtras | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    Promise.allSettled([
      firestoreService.getJournalEntries(400).then((list) => withPendingJournal(list)),
      firestoreService.getReadingSessions().then((list) => withPendingReadings(list)),
      listRecordings(),
    ]).then(([j, r, rec]) => {
      if (!live) return;
      if (j.status === 'rejected') logger.warn('Revo: daily log not loaded', j.reason);
      if (r.status === 'rejected') logger.warn('Revo: readings not loaded', r.reason);
      setExtras({
        journal: j.status === 'fulfilled' ? (j.value as JournalEntry[]) : null,
        readings: r.status === 'fulfilled' ? (r.value as ReadingSession[]) : null,
        recordings: rec.status === 'fulfilled' ? (rec.value as RecordingMeta[]) : null,
      });
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return extras;
}
