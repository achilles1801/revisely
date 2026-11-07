import { useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useSharedActivityHistory } from '../activityHistory';
import { generateDailyAssignment } from '../algorithm';
import { getQuranData } from '../quranData';
import { todaySnapshot } from '../todaySnapshot';
import { buildRevoContext } from './context';
import type { RevoContext } from './types';

/**
 * The revision day, and Revo's context built from the account's data as Home sees it now: the same
 * assignment, the same snapshot (lib/todaySnapshot) and the same history Home's streak read.
 */
export function useRevoContext(): { day: string; context: RevoContext | null; build: () => RevoContext | null } {
  const { user, pages, logs } = useApp();
  const { day, date } = useRevisionDay(user);
  const history = useSharedActivityHistory(user?.id, day);
  const assignment = useMemo(() => (user ? generateDailyAssignment(pages, getQuranData(), user, date).pages : []), [user, pages, date]);
  const build = useCallback(() => {
    if (!user) return null;
    const snapshot = todaySnapshot({ user, pages, logs, day, assignment, history, now: Date.now() });
    return buildRevoContext({ user, pages, logs, snapshot });
  }, [user, pages, logs, day, assignment, history]);
  const context = useMemo(build, [build]);
  return { day, context, build };
}
