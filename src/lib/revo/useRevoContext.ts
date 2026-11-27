import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useSharedActivityHistory } from '../activityHistory';
import { generateDailyAssignment } from '../algorithm';
import { gapsInsightsEnabled } from '../insightsGaps';
import { journalFirstDay } from '../journal';
import { getQuranData } from '../quranData';
import { todaySnapshot } from '../todaySnapshot';
import { getQuranWords, loadQuranWords, type QuranWords } from '../recite/quranWords';
import { reciteLiveForAccount } from '../reciteLive/availability';
import { useMemoryRecords } from '../reciteMemory/store';
import { logger } from '../logger';
import { buildRevoContext } from './context';
import { ramadanDates, ramadanPhase } from '../ramadanDates';
import { useRamadanTheme } from '../ramadanTheme';
import { withPendingReadings } from '../offline/queue';
import * as firestoreService from '../../services/firestoreService';
import type { ReadingSession } from '../../types';
import { revoRamadan } from './ramadan';
import { revoGaps } from './gaps';
import { recitationForRevo } from './recitation';
import { revoPatternsOn, revoReciteOn } from './release';
import type { FactSources } from './facts';
import { greetingExtrasFor, type GreetingExtras } from './greeting';
import type { RevoContext } from './types';

/** "Wednesday": the next revision day with pages, when it isn't tomorrow. */

/**
 * The revision day, and Revo's context built from the account's data as Home sees it now: the same
 * assignment, the same snapshot (lib/todaySnapshot) and the same history Home's streak read.
 * `sources` gives the same data for what + attaches (lib/revo/facts). `extras` is what the greeting
 * also says and the context doesn't carry, as Home has it: "Done · N" and where the next day starts.
 */
export function useRevoContext(): {
  day: string;
  context: RevoContext | null;
  extras: GreetingExtras;
  build: () => RevoContext | null;
  sources: () => FactSources | null;
} {
  const { user, pages, logs } = useApp();
  const { day, date } = useRevisionDay(user);
  // Revisely Dev, an account that recites with Mark mistakes (RINS-1): what Recite found goes with each question.
  const reciteOn = reciteLiveForAccount(user);
  const records = useMemoryRecords(user?.id, reciteOn);
  const words = useWordsFor(reciteOn && records.length > 0);
  const recitation = useCallback(() => (reciteOn ? recitationForRevo(records, day, words) : null), [reciteOn, records, day, words]);
  const history = useSharedActivityHistory(user?.id, day);
  // Revisely Dev (ACT-28, ACT-30): Insights' Gaps and Last revised go with each question, from the items Home read.
  // Not before they load: from none, the figures would say no day was revised (as the section once flashed).
  const gaps = useMemo(
    () =>
      user && history && gapsInsightsEnabled(user)
        ? revoGaps({ user, pages, history, today: day, firstDay: journalFirstDay(user, history.map((h) => ({ date: h.day }))) })
        : null,
    [user, pages, history, day],
  );
  const assignment = useMemo(() => (user ? generateDailyAssignment(pages, getQuranData(), user, date).pages : []), [user, pages, date]);
  // Ramadan so far (THEME-8), during the month with the theme showing: the timed readings count too.
  const inRamadan = useRamadanTheme() && ramadanPhase(day).kind === 'during';
  const readings = useRamadanReadings(inRamadan);
  const ramadan = useMemo(() => (inRamadan ? revoRamadan(logs, readings, ramadanDates(day), day) : null), [inRamadan, logs, readings, day]);
  const sources = useCallback((): FactSources | null => {
    if (!user) return null;
    const now = Date.now();
    const snapshot = todaySnapshot({ user, pages, logs, day, assignment, history, now });
    return { user, pages, logs, history, snapshot, now };
  }, [user, pages, logs, day, assignment, history]);
  const build = useCallback(() => {
    const src = sources();
    return src
      ? buildRevoContext({ user: src.user, pages: src.pages, logs: src.logs, snapshot: src.snapshot, history: src.history, patterns: revoPatternsOn(), recite: revoReciteOn(), recitation: recitation(), gaps, ramadan })
      : null;
  }, [sources, recitation, gaps, ramadan]);
  const { context, extras } = useMemo(() => {
    const src = sources();
    if (!src) return { context: null, extras: {} };
    const { snapshot } = src;
    return {
      context: buildRevoContext({ user: src.user, pages: src.pages, logs: src.logs, snapshot, history: src.history, patterns: revoPatternsOn(), recite: revoReciteOn(), recitation: recitation(), gaps, ramadan }),
      extras: greetingExtrasFor({ user: src.user, pages: src.pages, logs: src.logs, day, assignment, snapshot }),
    };
  }, [sources, assignment, day, recitation, gaps, ramadan]);
  return { day, context, extras, build, sources };
}

/** The word data (a take's passage needs it), loaded once something asks for it; null until then. */
function useWordsFor(enabled: boolean): QuranWords | null {
  const [words, setWords] = useState<QuranWords | null>(getQuranWords());
  useEffect(() => {
    if (!enabled || words) return;
    let alive = true;
    loadQuranWords()
      .then((w) => {
        if (alive) setWords(w);
      })
      .catch((err) => logger.warn('Revo: the word data did not load', err));
    return () => {
      alive = false;
    };
  }, [enabled, words]);
  return words;
}

/** The timed readings, loaded once `active` (Revo's Ramadan facts count their pages); empty until then. */
function useRamadanReadings(active: boolean): ReadingSession[] {
  const [readings, setReadings] = useState<ReadingSession[]>([]);
  useEffect(() => {
    if (!active) return;
    let live = true;
    firestoreService
      .getReadingSessions()
      .then((list) => {
        if (live) setReadings(withPendingReadings(list));
      })
      .catch((err) => logger.warn('Could not read the readings for Revo’s Ramadan', err));
    return () => {
      live = false;
    };
  }, [active]);
  return readings;
}
