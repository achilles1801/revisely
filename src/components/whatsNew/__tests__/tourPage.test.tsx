// The tour's first slide is about the account's page today (useTourPage). A partly memorized page is named by its
// memorized ayahs (MEM-4), as Home names it: only An-Nas memorized on the last page reads "An-Nas" (USER-1; the
// user-matrix sweep, Nov 27 2026: it read the whole page, "Al-Ikhlas to An-Nas").
import { renderHook } from '@testing-library/react-native';
import { useTourPage } from '../tour/TourMoment';
import type { User, UserPage } from '../../../types';

const today = new Date(2026, 10, 27);
const page = (pageNumber: number, extra: Partial<UserPage> = {}): UserPage => ({
  pageNumber,
  status: 'not_memorized',
  dateMemorized: null,
  weaknessRating: 4,
  lastRevisedDate: null,
  totalRevisionCount: 0,
  skipCount: 0,
  ...extra,
});
const mockApp: { user: Partial<User>; pages: UserPage[] } = {
  user: { id: 'u1', dailyPageCapacity: 5, scheduleMode: 'pages', dailyJuzCount: 1, customPlan: null, scheduleAnchorDate: today.toISOString(), createdAt: today.toISOString(), fajrBoundaryEnabled: false, locationCoords: null },
  pages: [],
};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../../hooks/useRevisionDay', () => ({ useRevisionDay: () => ({ day: '2026-11-27', date: new Date(2026, 10, 27) }) }));

describe('the tour’s page (useTourPage)', () => {
  it('[MEM-4] [USER-1] names a partly memorized page by its memorized ayahs', () => {
    // An-Nas alone (114:1–6) on page 604.
    mockApp.pages = Array.from({ length: 604 }, (_, i) =>
      i + 1 === 604 ? page(604, { status: 'in_progress', verses: [114001, 114002, 114003, 114004, 114005, 114006] }) : page(i + 1),
    );
    const { result } = renderHook(() => useTourPage());
    expect(result.current.page).toBe(604);
    expect(result.current.name.replace(/‑/g, '-')).toBe('An-Nas');
  });

  it('[USER-1] a whole page keeps its own name', () => {
    mockApp.pages = Array.from({ length: 604 }, (_, i) => page(i + 1, i + 1 === 604 ? { status: 'memorized' } : {}));
    const { result } = renderHook(() => useTourPage());
    expect(result.current.page).toBe(604);
    expect(result.current.name).not.toBe('');
  });
});
