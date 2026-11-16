// Revisely Dev says so with each question (context.app), so the server adds the Dev guide: what only Revisely Dev
// has, such as Recite (functions/src/revo/guide.ts). The store app never sends it, so its questions stay as they were.
import type { User, UserPage } from '../../../types';
import { todaySnapshot } from '../../todaySnapshot';
import { buildRevoContext } from '../context';

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
const build = () => buildRevoContext({ user, pages, logs: [], snapshot, now: new Date(now) });

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
});
