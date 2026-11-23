// The Memorized picker in Revisely Dev (MEM-8): choose on the real page, apart from the reader, and see
// what was chosen as pages in the sheet. The sheet's writes are the real ones (ACT-5, MEM-1).
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AddMemorizedSheet } from '../../../src/components/activity/AddMemorizedSheet';
import { ayahRects } from '../../../src/lib/ayahBounds';
import { ayahOf, ayahsOnPage, suraOf } from '../../../src/lib/ayahKeys';
import { addAyahs } from '../../../src/lib/memorizedAyahs';
import { queueChange } from '../../../src/lib/offline/queue';
import { fitPage } from '../../../src/lib/pageFit';
import { plainText } from '../../../src/lib/passages';
import { quranWords } from '../../../src/lib/recite/__fixtures__/quranWords';

const PAGE = 379;
const here = ayahsOnPage(PAGE);
const base = Array.from({ length: 604 }, (_, i) => ({
  pageNumber: i + 1,
  status: i + 1 < PAGE ? 'memorized' : 'not_memorized',
  dateMemorized: null,
}));
// The first three ayahs of the page are memorized: it is where they left off.
const mockPages = addAyahs(base as never, here.slice(0, 3), '2026-11-01T12:00:00.000Z').pages;
const mockUpdatePages = jest.fn(async (..._args: unknown[]) => undefined);
let mockCached: string | null = 'file:///page.png';
let mockOffline = false;

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../src/lib/variant', () => ({ ...jest.requireActual('../../../src/lib/variant'), isDevVariant: () => true }));
jest.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({ user: { id: 'u1' }, pages: mockPages, updatePages: (...a: unknown[]) => mockUpdatePages(...a) }),
}));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('../../../src/lib/offline/queue', () => ({ queueChange: jest.fn(async () => undefined), currentAccount: () => null }));
jest.mock('../../../src/services/firestoreService', () => ({ getReadingSessionsForDay: jest.fn(async () => []) }));
jest.mock('../../../src/components/memorization/RangePickerSheet', () => ({ RangePickerSheet: () => null }));
jest.mock('../../../src/lib/pageCache', () => ({
  getCachedPageUri: () => mockCached,
  cachePage: async () => mockCached,
}));
jest.mock('../../../src/lib/networkState', () => ({ ...jest.requireActual('../../../src/lib/networkState'), knownOffline: () => mockOffline }));
jest.mock('../../../src/components/reciteMemory/TakeRows', () => ({
  useQuranWordsWhen: () => jest.requireActual('../../../src/lib/recite/__fixtures__/quranWords').quranWords(),
}));
type MockAction = { label: string; onPress: () => void; disabled?: boolean; testID?: string };
jest.mock('../../../src/components/v2/Sheet', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    Sheet: ({ visible, children, left, right, testID }: { visible: boolean; children: React.ReactNode; left?: MockAction; right?: MockAction; testID?: string }) =>
      visible
        ? React.createElement(
            View,
            null,
            left ? React.createElement(Pressable, { testID: `${testID}-cancel`, onPress: left.onPress }, React.createElement(Text, null, left.label)) : null,
            children,
            right ? React.createElement(Pressable, { testID: right.testID, disabled: right.disabled, onPress: right.onPress }, React.createElement(Text, null, right.label)) : null,
          )
        : null,
  };
});

const AREA = { width: 300, height: 500 };

async function flush() {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

function flatText(el: { props: { children?: unknown } }): string {
  const walk = (c: unknown): string => (typeof c === 'string' || typeof c === 'number' ? String(c) : Array.isArray(c) ? c.map(walk).join('') : c && typeof c === 'object' && 'props' in (c as object) ? walk((c as { props: { children?: unknown } }).props.children) : '');
  return plainText(walk(el.props.children));
}

/** Opens the picker and gives its page area a size. */
async function openPicker(screen: ReturnType<typeof render>) {
  fireEvent.press(screen.getByTestId('add-memorized-choose'));
  await flush();
}

/** A tap on an ayah on the drawn page. */
function tapAyah(screen: ReturnType<typeof render>, key: number) {
  const size = fitPage(AREA.width, AREA.height);
  const r = ayahRects(PAGE, suraOf(key), ayahOf(key))[0];
  fireEvent.press(screen.getByTestId('memorized-picker-page'), {
    nativeEvent: { locationX: ((r.x0 + r.x1) / 2) * size.scale, locationY: ((r.y0 + r.y1) / 2) * size.scale },
  });
}

function sizeArea(screen: ReturnType<typeof render>) {
  const nodes = screen.UNSAFE_root.findAll((n: { props: Record<string, any> }) => typeof n.props.onLayout === 'function' && n.props.style?.alignSelf === 'stretch');
  act(() => nodes[0].props.onLayout({ nativeEvent: { layout: AREA } }));
}

describe('The Memorized picker (MEM-8)', () => {
  beforeEach(() => {
    (queueChange as unknown as jest.Mock).mockClear();
    mockUpdatePages.mockClear();
    mockCached = 'file:///page.png';
    mockOffline = false;
  });

  it('[MEM-8] opens where they left off; a tap chooses up to there; the sheet shows the page; Add saves just those ayahs', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    await flush();
    expect(screen.getByTestId('add-memorized-tab-page')).toBeTruthy();
    expect(screen.queryByTestId('add-memorized-tab-ayahs')).toBeNull();
    await openPicker(screen);
    sizeArea(screen);
    await flush();
    expect(flatText(screen.getByTestId('memorized-picker-where'))).toBe('3rd page of 9');
    expect(screen.getAllByTestId('picker-faded').length).toBeGreaterThan(0);

    tapAyah(screen, here[6]);
    expect(screen.getAllByTestId('picker-chosen').length).toBeGreaterThan(0);
    fireEvent.press(screen.getByTestId('memorized-picker-done'));
    await flush();

    expect(screen.queryByTestId('memorized-picker-page')).toBeNull();
    expect(screen.getByTestId('add-memorized-preview-379')).toBeTruthy();
    expect(flatText(screen.getByTestId('add-memorized-name'))).toBe('An-Naml, 3rd page');
    expect(flatText(screen.getByTestId('add-memorized-sub'))).toBe('4 ayahs · up to');

    fireEvent.press(screen.getByTestId('add-memorized-add'));
    await flush();
    expect(queueChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'memorization.mark', day: '2026-11-03', pages: [PAGE], verses: here.slice(3, 7) }),
    );
  });

  it('[MEM-8] Cancel keeps what was chosen before, and a preview’s page reopens it there', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    await flush();
    await openPicker(screen);
    sizeArea(screen);
    await flush();
    fireEvent.press(screen.getByTestId('memorized-picker-whole'));
    fireEvent.press(screen.getByTestId('memorized-picker-next'));
    await flush();
    fireEvent.press(screen.getByTestId('memorized-picker-whole'));
    fireEvent.press(screen.getByTestId('memorized-picker-done'));
    await flush();
    expect(flatText(screen.getByTestId('add-memorized-name'))).toBe('An-Naml, 3rd to 4th page');

    fireEvent.press(screen.getByTestId('add-memorized-preview-380'));
    await flush();
    expect(flatText(screen.getByTestId('memorized-picker-where'))).toBe('4th page of 9');
    fireEvent.press(screen.getByTestId('memorized-picker-clear'));
    fireEvent.press(screen.getByTestId('memorized-picker-cancel'));
    await flush();
    expect(flatText(screen.getByTestId('add-memorized-name'))).toBe('An-Naml, 3rd to 4th page');
  });

  it('[MEM-8] a page not on the phone, offline, is the same choice as a list of first words', async () => {
    mockCached = null;
    mockOffline = true;
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    await flush();
    await openPicker(screen);
    sizeArea(screen);
    await flush();
    expect(screen.getByTestId('memorized-picker-list')).toBeTruthy();
    const words = quranWords();
    const [from] = words.verseRange(suraOf(here[3]), ayahOf(here[3]));
    expect(screen.getByTestId(`memorized-picker-ayah-${here[3]}`).props.accessibilityLabel).toContain(words.uthmani(from));
    expect(screen.getByTestId(`memorized-picker-ayah-${here[0]}`).props.accessibilityState.disabled).toBe(true);
    fireEvent.press(screen.getByTestId(`memorized-picker-ayah-${here[4]}`));
    fireEvent.press(screen.getByTestId('memorized-picker-done'));
    await flush();
    expect(flatText(screen.getByTestId('add-memorized-sub'))).toBe('2 ayahs · up to');
  });
});
