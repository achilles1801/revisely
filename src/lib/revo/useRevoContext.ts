import { useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useSharedActivityHistory } from '../activityHistory';
import { generateDailyAssignment } from '../algorithm';
import { getQuranData } from '../quranData';
import { todaySnapshot } from '../todaySnapshot';
import { buildRevoContext } from './context';
import type { FactSources } from './facts';
import type { RevoContext } from './types';

/**
 * The revision day, and Revo's context built from the account's data as Home sees it now: the same
 * assignment, the same snapshot (lib/todaySnapshot) and the same history Home's streak read.
 * `sources` gives the same data for what + attaches (lib/revo/facts).
 */
export function useRevoContext(): { day: string; context: RevoContext | null; build: () => RevoContext | null; sources: () => FactSources | null } {
  const { user, pages, logs } = useApp();
  const { day, date } = useRevisionDay(user);
  const history = useSharedActivityHistory(user?.id, day);
  const assignment = useMemo(() => (user ? generateDailyAssignment(pages, getQuranData(), user, date).pages : []), [user, pages, date]);
  const sources = useCallback((): FactSources | null => {
    if (!user) return null;
    const now = Date.now();
    const snapshot = todaySnapshot({ user, pages, logs, day, assignment, history, now });
    return { user, pages, logs, history, snapshot, now };
  }, [user, pages, logs, day, assignment, history]);
  const build = useCallback(() => {
    const src = sources();
    return src ? buildRevoContext({ user: src.user, pages: src.pages, logs: src.logs, snapshot: src.snapshot }) : null;
  }, [sources]);
  const context = useMemo(build, [build]);
  return { day, context, build, sources };
}
