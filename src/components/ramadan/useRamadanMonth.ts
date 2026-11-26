// Ramadan as Insights shows it (BEHAVIOUR.md THEME-6): where today falls in the month, and the month so far from the
// phone's own days (lib/ramadanStats: the logs, and the timed readings once the month has begun). Null while the theme
// doesn't show here, or after Eid.

import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { getRevisionDayForUser } from '../../lib/fajrBoundary';
import { logger } from '../../lib/logger';
import { withPendingReadings } from '../../lib/offline/queue';
import { ramadanDates, ramadanPhase, useRamadanDatesVersion, type RamadanDates, type RamadanPhase } from '../../lib/ramadanDates';
import { ramadanStats, type RamadanStats } from '../../lib/ramadanStats';
import * as firestoreService from '../../services/firestoreService';
import type { ReadingSession } from '../../types';
import { useRamadanDecor } from './quiet';

export interface RamadanMonth {
  today: string;
  dates: RamadanDates;
  phase: Exclude<RamadanPhase, { kind: 'after' }>;
  stats: RamadanStats;
}

export function useRamadanMonth(): RamadanMonth | null {
  const shows = useRamadanDecor();
  const version = useRamadanDatesVersion();
  const { user, logs } = useApp();
  const today = getRevisionDayForUser(user);
  const dates = ramadanDates(today);
  const phase = ramadanPhase(today, dates);
  const begun = shows && (phase.kind === 'during' || phase.kind === 'eid');
  const [readings, setReadings] = useState<ReadingSession[]>([]);
  useEffect(() => {
    if (!begun) return;
    let live = true;
    firestoreService
      .getReadingSessions()
      .then((list) => live && setReadings(withPendingReadings(list)))
      .catch((err) => logger.warn('Could not read the readings for Ramadan', err));
    return () => {
      live = false;
    };
  }, [begun, today]);
  return useMemo(
    () => (shows && phase.kind !== 'after' ? { today, dates, phase, stats: ramadanStats(logs, readings, dates, today) } : null),
    [shows, today, dates.start, dates.eid, phase.kind, logs, readings, version], // eslint-disable-line react-hooks/exhaustive-deps
  );
}
