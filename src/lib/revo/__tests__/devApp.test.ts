// Revisely Dev says so with each question (context.app), so the server adds the Dev guide: what only Revisely Dev
// has, such as Recite (functions/src/revo/guide.ts). The store app never sends it, so its questions stay as they were.
import type { User, UserPage } from '../../../types';
import { todaySnapshot } from '../../todaySnapshot';
import { buildRevoContext } from '../context';
import type { RevoGaps } from '../types';

let mockDev = false;
jest.mock('../../variant', () => ({ isDevVariant: () => mockDev }));

const user = {
  id: 'u1',
  createdAt: '2026-10-01T12:00:00',
  scheduleAnchorDate: '2026-11-01T12:00:00',
  dailyPageCapacity: 2,
  scheduleMode: 'pages',
  dailyJuzCount: 1,
  customPlan: null,
  fajrBoundaryEnabled: false,
  locationCoords: null,
} as unknown as User;
const pages: UserPage[] = [582, 583, 584, 585].map((pageNumber) => ({
  pageNumber,
  status: 'memorized',
  dateMemorized: '2026-09-01T09:00:00',
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
}));
const now = Date.parse('2026-11-07T10:00:00');
const snapshot = todaySnapshot({ user, pages, logs: [], day: '2026-11-07', assignment: [584, 585], history: null, now });
const gaps: RevoGaps = {
  lastRevisedDaysAgo: 6,
  longestGap: { days: 6, endedDaysAgo: null },
  usualStepDays: null,
  longGaps: 1,
  fullRevision: null,
  surahs: [{ name: 'An-Naba', daysAgo: 6 }],
};
const build = (extra: { gaps?: RevoGaps | null; recite?: boolean; recitation?: Parameters<typeof buildRevoContext>[0]['recitation'] } = {}) =>
  buildRevoContext({ user, pages, logs: [], snapshot, now: new Date(now), ...extra });

describe('Revo’s context says which app asks', () => {
  afterEach(() => {
    mockDev = false;
  });

  it('the store app sends no app: its questions are as before', () => {
    expect('app' in build()).toBe(false);
  });

  it('Revisely Dev sends app "dev"', () => {
    mockDev = true;
    expect(build().app).toBe('dev');
  });

  // ACT-28, ACT-30, RINS-1: Gaps and the recitation are every account's from the mistake detection release, but a server
  // from before it refuses them from any app but Revisely Dev, and with them the whole question. So the store app sends
  // them only once config/app.revoRecite says the server takes them (set on release day, after deploying revoAsk).
  const recitation = { takes: 3 } as unknown as NonNullable<Parameters<typeof buildRevoContext>[0]['recitation']>;
  it('[ACT-28] [RINS-1] the store app sends Gaps and its recitation only once config/app.revoRecite is on', () => {
    // Off (until release day): neither, and the question is as every server takes it.
    const off = build({ gaps, recitation, recite: false });
    expect('gaps' in off).toBe(false);
    expect('recitation' in off).toBe(false);
    expect('app' in off).toBe(false);
    // On: both, still without app "dev" (no Dev guide).
    const on = build({ gaps, recitation, recite: true });
    expect(on).toMatchObject({ gaps, recitation });
    expect('app' in on).toBe(false);
    // Nothing to send: nothing sent, either way.
    expect('gaps' in build({ gaps: null, recite: true })).toBe(false);
  });

  it('[ACT-28] Revisely Dev sends them whatever the switch says (its backend has always taken them)', () => {
    mockDev = true;
    expect(build({ gaps, recitation, recite: false })).toMatchObject({ app: 'dev', gaps, recitation });
  });
});
