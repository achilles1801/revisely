import { useCallback, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { useRevisionDay } from '../../hooks/useRevisionDay';
import { useSharedActivityHistory } from '../activityHistory';
import { aheadLead, nextRevisionDayPlan } from '../aheadPlan';
import { generateDailyAssignment } from '../algorithm';
import { getQuranData } from '../quranData';
import { todaySnapshot } from '../todaySnapshot';
import { buildRevoContext } from './context';
import { revoPatternsOn } from './release';
import type { FactSources } from './facts';
import type { GreetingExtras } from './greeting';
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
    return src ? buildRevoContext({ user: src.user, pages: src.pages, logs: src.logs, snapshot: src.snapshot, history: src.history, patterns: revoPatternsOn() }) : null;
  }, [sources]);
  const { context, extras } = useMemo(() => {
    const src = sources();
    if (!src) return { context: null, extras: {} };
    const { snapshot } = src;
    // Home's "Tomorrow starts at …" (DashboardScreen's aheadNext): only once today is done.
    let next: GreetingExtras['next'] = null;
    if (snapshot.status === 'completed' && assignment.length > 0) {
      const plan = nextRevisionDayPlan(src.user, src.pages, day, new Set(assignment), src.logs);
      if (plan && plan.pages.length > 0) {
        next = { lead: aheadLead(src.user, src.pages, day, plan, { long: true }), first: plan.pages[0], pages: plan.pages.length };
      }
    }
    return {
      context: buildRevoContext({ user: src.user, pages: src.pages, logs: src.logs, snapshot, history: src.history, patterns: revoPatternsOn() }),
      // Smart Tracking unset is off, as Activity reads it.
      extras: { doneCount: snapshot.done.size, next, strength: src.user.smartTrackingEnabled === true },
    };
  }, [sources, assignment, day]);
  return { day, context, extras, build, sources };
}
