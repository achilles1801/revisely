// The Activity calendar (gap audit §3) and Insights (§5): the Overview | Insights tabs, the month with its totals and
// stepping, and the Week | Month toggle (kept: Majd, Nov 2026).
import React from 'react';
import { Dimensions, Text } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { ActivityBlocksViews } from '../ActivityBlocksViews';
import { plainText } from '../../../lib/passages';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
}));
let mockPages: { pageNumber: number; status: string; weaknessRating: number }[] = [];
// Smart Tracking on unless a test turns it off: Weak spots needs it (ACT-12).
let mockUser: { smartTrackingEnabled: boolean } = { smartTrackingEnabled: true };
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ pages: mockPages, user: mockUser, logs: [] }) }));
const mockPalette = new Proxy({}, { get: () => '#000000' });
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('../../../services/firestoreService', () => ({
  getActivityItemsBetween: jest.fn(() => Promise.resolve({ revisions: [], memorized: [], reads: [] })),
  getMemorizationsBetween: jest.fn(() => Promise.resolve([])),
}));
jest.mock('../../../lib/revo/open', () => ({ openRevo: jest.fn() }));
jest.mock('../../../lib/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../../lib/recordings', () => ({
  listRecordings: jest.fn(() =>
    Promise.resolve([
      { id: 'r1', day: '2026-11-05', kind: 'revision' },
      { id: 'r2', day: '2026-11-05', kind: 'revision' },
    ]),
  ),
  onRecordingsChanged: jest.fn(() => () => undefined),
}));
jest.mock('../useActivityReload', () => {
  const mockReact = jest.requireActual('react');
  return { useActivityReload: (load: () => void) => mockReact.useEffect(() => load(), []) };
});
jest.mock('../DayParts', () => ({ ProgressRing: () => null }));

const TODAY = '2026-11-05';
const props = { today: TODAY, noteDays: new Set<string>(), onOpenDay: jest.fn(), onReviseTomorrow: jest.fn(), onPlanIt: jest.fn(), onOpenPage: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
  mockPages = [];
  mockUser = { smartTrackingEnabled: true };
});

describe('the Activity calendar (gap audit §3)', () => {
  it('shows the Overview and Insights tabs, and the Week | Month toggle (Majd, Nov 2026)', async () => {
    render(<ActivityBlocksViews {...props} />);
    expect(await screen.findByTestId('calendar-month')).toBeTruthy();
    expect(screen.getByText('Overview')).toBeTruthy();
    expect(screen.getByText('Insights')).toBeTruthy();
    expect(screen.getByText('Week')).toBeTruthy();
    expect(screen.getByText('Month')).toBeTruthy();
  });

  it('Week shows the seven days of the week, each with its summary', async () => {
    render(<ActivityBlocksViews {...props} />);
    fireEvent.press(await screen.findByText('Week'));
    expect(await screen.findByTestId('calendar-week')).toBeTruthy();
    expect(screen.getAllByText('Nothing logged')).toHaveLength(7);
  });

  it('shows the month’s title and its four totals', async () => {
    render(<ActivityBlocksViews {...props} />);
    expect(await screen.findByText('November 2026')).toBeTruthy();
    // Each label is in the totals and in the legend: at least one of each.
    for (const label of ['Revised', 'Memorized', 'Read', 'Notes']) expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  });

  it('the picked day’s preview shows its recordings beside Revised (mock d3)', async () => {
    const service = jest.requireMock('../../../services/firestoreService') as { getActivityItemsBetween: jest.Mock };
    const empty = { revisions: [], memorized: [], reads: [] };
    service.getActivityItemsBetween.mockResolvedValue({
      revisions: [{ id: TODAY, day: TODAY, countsFor: TODAY, pages: [1, 2], skipped: [], assigned: [1, 2], minutes: 12, occurredAt: null }],
      memorized: [],
      reads: [],
    });
    try {
      render(<ActivityBlocksViews {...props} />);
      expect(await screen.findByTestId('preview-recordings-revised')).toBeTruthy();
      expect(screen.getByLabelText('2 recordings')).toBeTruthy();
    } finally {
      service.getActivityItemsBetween.mockResolvedValue(empty);
    }
  });

  // At the largest text the date pushed "Open" off the screen's edge and the rows clipped into each
  // other (iOS, Nov 2026): the date gives way, the preview's chrome stops at 1.4×, rows may grow.
  it('the picked day’s preview keeps Open on screen at the largest text', async () => {
    render(<ActivityBlocksViews {...props} />);
    const open = await screen.findByLabelText('Open the day');
    expect(screen.getByText('Open').props.maxFontSizeMultiplier).toBe(1.4);
    const head = open.parent?.parent as { props: { style: unknown } } | undefined;
    const flat = (st: unknown): Record<string, unknown> => (Array.isArray(st) ? Object.assign({}, ...st.map(flat)) : ((st as Record<string, unknown>) ?? {}));
    expect(flat(head?.props.style).height).toBeUndefined();
    const date = screen.getByTestId('preview-date');
    expect(date.props.maxFontSizeMultiplier).toBe(1.4);
    expect(flat(date.props.style).flexShrink).toBe(1);
  });

  // At the largest text the pills clipped, the month's title pushed the chevrons off, the totals broke
  // mid-word and ran off the edge, and the day numbers spilled out of their discs (iOS, Nov 2026). Every
  // piece of the Overview is chrome: it stops at 1.4×; numbers shrink to fit; the totals go two by two.
  describe('at the largest text', () => {
    const flat = (st: unknown): Record<string, unknown> => (Array.isArray(st) ? Object.assign({}, ...st.map(flat)) : ((st as Record<string, unknown>) ?? {}));
    let dims: jest.SpyInstance;
    const atScale = (fontScale: number) => {
      dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width: 375, height: 667, scale: 2, fontScale });
    };
    afterEach(() => dims?.mockRestore());

    it('every text in the Overview stops growing at 1.4×', async () => {
      atScale(3.1);
      render(<ActivityBlocksViews {...props} />);
      await screen.findByText('November 2026');
      // Words and numbers only: an icon is a Text holding its glyph (a private-use character).
      const words = (c: unknown): string =>
        Array.isArray(c) ? c.map(words).join('') : typeof c === 'string' || typeof c === 'number' ? String(c).replace(/[\uE000-\uF8FF]/g, '') : '';
      const texts = screen.UNSAFE_getAllByType(Text).filter((t) => words(t.props.children).trim() !== '');
      expect(texts.length).toBeGreaterThan(40);
      const uncapped = texts.filter((t) => !(typeof t.props.maxFontSizeMultiplier === 'number' && t.props.maxFontSizeMultiplier <= 1.4)).map((t) => words(t.props.children));
      expect(uncapped).toEqual([]);
    });

    it('the pills grow with their label rather than clip it', async () => {
      atScale(3.1);
      render(<ActivityBlocksViews {...props} />);
      await screen.findByText('November 2026');
      for (const id of ['pill-calendar', 'pill-insights', 'pill-week', 'pill-month']) {
        const style = flat(screen.getByTestId(id).props.style);
        expect(style.height).toBeUndefined();
        expect(style.minHeight).toBeGreaterThan(0);
      }
    });

    it('the title gives way to the chevrons and shrinks to fit', async () => {
      atScale(3.1);
      render(<ActivityBlocksViews {...props} />);
      const title = await screen.findByTestId('calendar-month-title');
      expect(title.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
      expect(flat(title.props.style).flexShrink).toBe(1);
      expect(flat((title.parent?.parent as { props: { style: unknown } }).props.style).height).toBeUndefined();
    });

    it('the totals go two by two, their values on one line, shrinking to fit', async () => {
      atScale(3.1);
      render(<ActivityBlocksViews {...props} />);
      await screen.findByTestId('calendar-totals');
      for (const label of ['revised', 'memorized', 'read', 'notes']) {
        const total = screen.getByTestId(`calendar-total-${label}`);
        expect(flat(total.props.style)).toMatchObject({ flexBasis: '40%', flexGrow: 1 });
      }
      const value = screen.getByText('+0 pages');
      expect(value.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
    });

    it('at the default size the four totals stay in one row', async () => {
      atScale(1);
      render(<ActivityBlocksViews {...props} />);
      await screen.findByTestId('calendar-totals');
      expect(flat(screen.getByTestId('calendar-total-memorized').props.style)).toMatchObject({ flex: 1 });
    });

    it('a day’s number shrinks inside its disc rather than spill out', async () => {
      atScale(3.1);
      render(<ActivityBlocksViews {...props} />);
      const day = await screen.findByTestId('calendar-day-2026-11-28');
      const number = within(day).getByText('28');
      expect(number.props).toMatchObject({ numberOfLines: 1, adjustsFontSizeToFit: true });
    });
  });

  it('the preview names what was memorized and read by surah, not pages (Majd, Nov 7 2026)', async () => {
    const service = jest.requireMock('../../../services/firestoreService') as { getActivityItemsBetween: jest.Mock };
    service.getActivityItemsBetween.mockResolvedValue({
      revisions: [],
      memorized: [{ id: TODAY, day: TODAY, pages: [562] }],
      reads: [{ id: 'r', day: TODAY, pages: [562, 563, 564], minutes: 22, occurredAt: null }],
    });
    try {
      render(<ActivityBlocksViews {...props} />);
      expect(await screen.findByText('Start of Al-Mulk', { normalizer: plainText })).toBeTruthy();
      expect(screen.getByText('Al-Mulk to Al-Qalam · 22 min', { normalizer: plainText })).toBeTruthy();
    } finally {
      service.getActivityItemsBetween.mockResolvedValue({ revisions: [], memorized: [], reads: [] });
    }
  });

  it('steps to the next month and shows its title', async () => {
    render(<ActivityBlocksViews {...props} />);
    await screen.findByText('November 2026');
    fireEvent.press(screen.getByLabelText('Next month'));
    await waitFor(() => expect(screen.getByText('December 2026')).toBeTruthy());
  });
});

describe('Insights (gap audit §5)', () => {
  it('has the five sections in order, no captions and no "Ask the coach"', async () => {
    render(<ActivityBlocksViews {...props} />);
    fireEvent.press(await screen.findByText('Insights'));
    expect(await screen.findByTestId('activity-insights')).toBeTruthy();
    expect(screen.getByText('Coverage')).toBeTruthy();
    expect(screen.getByText("Which juz you've revised lately")).toBeTruthy();
    expect(screen.getByText('Consistency')).toBeTruthy();
    expect(screen.getByText('Weak spots')).toBeTruthy();
    expect(screen.getByText('Memorization')).toBeTruthy();
    // Pace hides under ten timed items; the coach's entry is gone (Revo's Ask replaces it).
    expect(screen.queryByText('Pace')).toBeNull();
    expect(screen.queryByText('Ask the coach')).toBeNull();
    expect(screen.queryByText(/as a share of all memorized pages/)).toBeNull();
    expect(screen.getAllByTestId(/^juz-tile-/)).toHaveLength(30);
  });

  it('lists a weak page and sends its pages to tomorrow', async () => {
    mockPages = [
      { pageNumber: 546, status: 'memorized', weaknessRating: 2 },
      { pageNumber: 547, status: 'memorized', weaknessRating: 2 },
      { pageNumber: 550, status: 'memorized', weaknessRating: 4 },
    ];
    render(<ActivityBlocksViews {...props} />);
    fireEvent.press(await screen.findByText('Insights'));
    // By surah and ayahs, the pages a quiet detail after (Majd, Nov 7 2026).
    expect(await screen.findByText('Al-Hashr, ayahs 4–16  pp. 546–547', { normalizer: plainText })).toBeTruthy();
    expect(screen.getByText('Weak now')).toBeTruthy();
    fireEvent.press(screen.getByText('Revise Al-Hashr 4–16 first tomorrow', { normalizer: plainText }));
    expect(props.onReviseTomorrow).toHaveBeenCalledWith([546, 547]);
    fireEvent.press(screen.getByTestId('weak-spot-546'));
    expect(props.onOpenPage).toHaveBeenCalledWith(546);
  });

  it('names the juz untouched the longest and plans its pages', async () => {
    const juz30 = Array.from({ length: 23 }, (_, i) => 582 + i);
    mockPages = juz30.map((pageNumber) => ({ pageNumber, status: 'memorized', weaknessRating: 4 }));
    render(<ActivityBlocksViews {...props} />);
    fireEvent.press(await screen.findByText('Insights'));
    expect(await screen.findByText('Juz 30, untouched the longest')).toBeTruthy();
    fireEvent.press(screen.getByTestId('insights-plan-it'));
    expect(props.onPlanIt).toHaveBeenCalledWith(juz30);
  });

  it('a juz with one page memorized is being learned, never the one untouched the longest [ACT-4]', async () => {
    mockPages = [{ pageNumber: 590, status: 'memorized', weaknessRating: 4 }];
    render(<ActivityBlocksViews {...props} />);
    fireEvent.press(await screen.findByText('Insights'));
    expect(await screen.findByLabelText('Juz 30, not memorized, learning')).toBeTruthy();
    expect(screen.queryByTestId('insights-untouched')).toBeNull();
  });

  it('Weak spots ends in "See all pages by strength", which opens every page by strength (ACT-12)', async () => {
    const onSeeAllPages = jest.fn();
    render(<ActivityBlocksViews {...props} onSeeAllPages={onSeeAllPages} onTurnOnSmartTracking={jest.fn()} />);
    fireEvent.press(await screen.findByText('Insights'));
    expect(await screen.findByText('Weak spots')).toBeTruthy();
    // With Smart Tracking on there is nothing to turn on.
    expect(screen.queryByTestId('insights-smart-tracking')).toBeNull();
    fireEvent.press(screen.getByText('See all pages by strength'));
    expect(onSeeAllPages).toHaveBeenCalledTimes(1);
  });

  it('without Smart Tracking one line in Weak spots’ place turns it on: a link, capped as chrome (ACT-12)', async () => {
    mockUser = { smartTrackingEnabled: false };
    const onTurnOnSmartTracking = jest.fn();
    render(<ActivityBlocksViews {...props} onSeeAllPages={jest.fn()} onTurnOnSmartTracking={onTurnOnSmartTracking} />);
    fireEvent.press(await screen.findByText('Insights'));
    const line = await screen.findByRole('link', { name: 'Turn on Smart Tracking to see your weak spots' });
    expect(screen.getByText('Turn on Smart Tracking to see your weak spots').props.maxFontSizeMultiplier).toBe(1.4);
    // Between Consistency and Memorization, where Weak spots would be.
    const order = ['Consistency', 'Turn on Smart Tracking to see your weak spots', 'Memorization'].map((t) =>
      JSON.stringify(screen.toJSON()).indexOf(`"${t}"`),
    );
    expect(order).toEqual([...order].sort((x, y) => x - y));
    expect(order.every((i) => i >= 0)).toBe(true);
    fireEvent.press(line);
    expect(onTurnOnSmartTracking).toHaveBeenCalledTimes(1);
  });

  it('without Smart Tracking no page is rated: no Weak spots, no Ask, no "See all"; the rest stays (ACT-12)', async () => {
    mockUser = { smartTrackingEnabled: false };
    mockPages = [{ pageNumber: 546, status: 'memorized', weaknessRating: 2 }];
    render(<ActivityBlocksViews {...props} onSeeAllPages={jest.fn()} />);
    fireEvent.press(await screen.findByText('Insights'));
    expect(await screen.findByText('Coverage')).toBeTruthy();
    expect(screen.getByText('Consistency')).toBeTruthy();
    expect(screen.getByText('Memorization')).toBeTruthy();
    expect(screen.queryByText('Weak spots')).toBeNull();
    expect(screen.queryByTestId('weak-spot-546')).toBeNull();
    expect(screen.queryByText(/Al-Hashr/, { normalizer: plainText })).toBeNull();
    expect(screen.queryByTestId('insights-see-all-pages')).toBeNull();
    expect(screen.queryByTestId('insights-ask-revo')).toBeNull();
  });
});
