// A plan of rest days alone (SCHED-7; Majd, Nov 27 2026: "Rest days only" for it in Edit schedule): never "0 pages a
// day" with "Every page comes round every 3 days".
import { scheduleSummary } from '../scheduleSummary';
import type { User, UserPage } from '../../types';

const today = new Date(2026, 10, 27);
const user = {
  id: 'u1',
  dailyPageCapacity: 5,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  scheduleAnchorDate: today.toISOString(),
  createdAt: today.toISOString(),
  customPlan: { days: [[], [], []], cycleStartDate: '2026-11-27', direction: 'forward' },
} as unknown as User;
const pages = [1, 2, 3].map((pageNumber) => ({ pageNumber, status: 'memorized', dateMemorized: null, weaknessRating: 4, lastRevisedDate: null, totalRevisionCount: 0, skipCount: 0 }) as UserPage);

it('[SCHED-7] a plan of rest days alone reads "Rest days only", with no line about pages coming round', () => {
  expect(scheduleSummary(user, pages, today)).toEqual({ perDay: 'Rest days only', repeats: null });
  const withPages = { ...user, customPlan: { ...user.customPlan!, days: [[1, 2], [], [3]] } } as User;
  expect(scheduleSummary(withPages, pages, today)).toEqual({ perDay: '1–2 pages a day', repeats: 'Every page comes round every 3 days' });
});
