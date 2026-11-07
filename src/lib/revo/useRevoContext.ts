import { useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { generateDailyAssignment } from '../algorithm';
import { ownPagesOf } from '../carryOver';
import { getQuranData } from '../quranData';
import { buildRevoContext } from './context';
import type { RevoContext } from './types';

/** The revision day, and Revo's context built from the account's data as Home sees it now. */
export function useRevoContext(): { day: string; context: RevoContext | null; build: () => RevoContext | null } {
  const { user, pages, logs } = useApp();
  const { day, date } = useRevisionDay(user);
  const assignment = useMemo(() => {
    if (!user) return [];
    const all = generateDailyAssignment(pages, getQuranData(), user, date).pages;
    return ownPagesOf(all, user, day);
  }, [user, pages, date, day]);
  const build = useCallback(
    () => (user ? buildRevoContext({ user, pages, logs, today: day, assignment }) : null),
    [user, pages, logs, day, assignment],
  );
  const context = useMemo(build, [build]);
  return { day, context, build };
}
