import { useCallback, useState } from 'react';
import * as firestoreService from '../../services/firestoreService';
import { withPendingJournal, withPendingReadings } from '../../lib/offline/queue';
import { listRecordings, RecordingMeta } from '../../lib/recordings';
import { logger } from '../../lib/logger';
import { sortTakeAudio } from '../../lib/reciteMemory/apart';
import type { JournalEntry, ReadingSession } from '../../types';
import { useActivityReload } from './useActivityReload';
import { getAuth } from 'firebase/auth';
import { useApp } from '../../context/AppContext';
import { keepActivity, useActivityKept } from '../../lib/activityKept';

const NO_READINGS: ReadingSession[] = [];
const NO_JOURNAL: JournalEntry[] = [];

/**
 * What Activity shows beyond the revision logs (which AppContext holds): timed
 * sessions, the daily log and this device's recordings. Loads on focus and
 * when the timer stops; each source on its own, so one failing still shows
 * the others (`loadError` says one did).
 */
export function useActivitySources() {
  const { user } = useApp();
  const uid = user?.id ?? null;
  // What the phone kept from the last read (ACT-36): the tab is filled from its first frame, no spinner.
  const kept = useActivityKept(uid);
  const [readings, setReadings] = useState<ReadingSession[] | null>(null);
  const [journal, setJournal] = useState<JournalEntry[] | null>(null);
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  const [read, setRead] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const shownReadings = readings ?? kept?.readings ?? NO_READINGS;
  const shownJournal = journal ?? kept?.journal ?? NO_JOURNAL;
  const loading = !read && !(kept?.readings && kept?.journal);

  const load = useCallback(async () => {
    const [r, j] = await Promise.allSettled([
      firestoreService.getReadingSessions(500, undefined, true).then((list) => withPendingReadings(list)),
      firestoreService.getJournalEntries(400, undefined, true).then((list) => withPendingJournal(list)),
    ]);
    // Old takes' audio out of the recordings first (RMEM-6): once a launch.
    sortTakeAudio()
      .then(() => listRecordings())
      .then(setRecordings)
      .catch((err) => logger.warn('Could not list recordings', err));
    const owner = getAuth().currentUser?.uid ?? null;
    if (r.status === 'fulfilled') {
      setReadings(r.value);
      if (owner) keepActivity(owner, 'readings', r.value);
    } else logger.error('Failed to load reading sessions', r.reason);
    if (j.status === 'fulfilled') {
      setJournal(j.value);
      if (owner) keepActivity(owner, 'journal', j.value);
    } else logger.error('Failed to load journal', j.reason);
    setLoadError(r.status === 'rejected' || j.status === 'rejected');
    setRead(true);
  }, []);

  useActivityReload(load);

  // A read that fails while the kept copy shows (before Auth has the account, offline) leaves it as it is, quietly.
  return { readings: shownReadings, journal: shownJournal, recordings, loading, loadError: loadError && !(kept?.readings && kept?.journal), load };
}
