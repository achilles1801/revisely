import { useCallback, useState } from 'react';
import * as firestoreService from '../../services/firestoreService';
import { withPendingJournal, withPendingReadings } from '../../lib/offline/queue';
import { listRecordings, RecordingMeta } from '../../lib/recordings';
import { logger } from '../../lib/logger';
import type { JournalEntry, ReadingSession } from '../../types';
import { useActivityReload } from './useActivityReload';

/**
 * What Activity shows beyond the revision logs (which AppContext holds): timed
 * sessions, the daily log and this device's recordings. Loads on focus and
 * when the timer stops; each source on its own, so one failing still shows
 * the others (`loadError` says one did).
 */
export function useActivitySources() {
  const [readings, setReadings] = useState<ReadingSession[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    const [r, j] = await Promise.allSettled([
      firestoreService.getReadingSessions().then((list) => withPendingReadings(list)),
      firestoreService.getJournalEntries(400).then((list) => withPendingJournal(list)),
    ]);
    listRecordings()
      .then(setRecordings)
      .catch((err) => logger.warn('Could not list recordings', err));
    if (r.status === 'fulfilled') setReadings(r.value);
    else logger.error('Failed to load reading sessions', r.reason);
    if (j.status === 'fulfilled') setJournal(j.value);
    else logger.error('Failed to load journal', j.reason);
    setLoadError(r.status === 'rejected' || j.status === 'rejected');
    setLoading(false);
  }, []);

  useActivityReload(load);

  return { readings, journal, recordings, loading, loadError, load };
}
