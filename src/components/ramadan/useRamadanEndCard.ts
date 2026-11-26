// The session's end card in Ramadan (BEHAVIOUR.md THEME-7): whether it's dressed, its line ("Day 12 of Ramadan", "Eid
// Mubarak"), and the khatmah card, shown once a Ramadan, the first time the session ends with every one of the Qur'an's
// 604 pages revised or read since 1 Ramadan (lib/ramadanStats). The end card is a page of the session, but not the
// mushaf's, so it reads the theme itself rather than RamadanQuiet's answer.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from '../../context/AppContext';
import { getRevisionDayForUser } from '../../lib/fajrBoundary';
import { logger } from '../../lib/logger';
import { withPendingReadings } from '../../lib/offline/queue';
import { ramadanDates, ramadanPhase } from '../../lib/ramadanDates';
import { QURAN_PAGES, ramadanStats } from '../../lib/ramadanStats';
import { useRamadanTheme } from '../../lib/ramadanTheme';
import * as firestoreService from '../../services/firestoreService';
import { t } from '../../i18n';

/** The 1 Ramadan of the last khatmah card shown on this phone: once a Ramadan. */
export const RAMADAN_KHATMAH_KEY = '@revisely_ramadan_khatmah:v1';

export function useRamadanEndCard(complete: boolean): { dressed: boolean; line: string | null; khatmah: boolean } {
  const shows = useRamadanTheme();
  const { user, logs } = useApp();
  const today = getRevisionDayForUser(user);
  const dates = ramadanDates(today);
  const phase = ramadanPhase(today, dates);
  const inMonth = phase.kind === 'during' || phase.kind === 'eid';
  const [khatmah, setKhatmah] = useState(false);
  // Keep going leaves the card for the next day's pages: the card it comes back to has had its khatmah.
  useEffect(() => {
    if (!complete) setKhatmah(false);
  }, [complete]);

  useEffect(() => {
    if (!shows || !complete || !inMonth || khatmah) return;
    let live = true;
    (async () => {
      try {
        if ((await AsyncStorage.getItem(RAMADAN_KHATMAH_KEY)) === dates.start) return;
        const readings = withPendingReadings(await firestoreService.getReadingSessions());
        if (!live || ramadanStats(logs, readings, dates, today).covered < QURAN_PAGES) return;
        setKhatmah(true);
        await AsyncStorage.setItem(RAMADAN_KHATMAH_KEY, dates.start);
      } catch (err) {
        logger.warn('Could not check this Ramadan’s khatmah', err);
      }
    })();
    return () => {
      live = false;
    };
  }, [shows, complete, inMonth, khatmah, logs, dates.start, dates.eid, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const line =
    !shows || !complete
      ? null
      : phase.kind === 'during'
        ? t('ramadan.endCard.day', { day: phase.day })
        : phase.kind === 'eid'
          ? t('ramadan.endCard.eid')
          : null;
  return { dressed: shows && complete, line, khatmah: shows && khatmah };
}
