// The Memorized add sheet (ACT-5): From and To (or a surah) mark those pages memorized, and record
// a Memorized item for today: the same two writes the composer makes. Whole pages picks From and To
// on a wheel of pages, as the Ayahs tab does with its surah and ayah wheels.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { plainText } from '../../../src/lib/passages';
import { AddMemorizedSheet } from '../../../src/components/activity/AddMemorizedSheet';
import { queueChange } from '../../../src/lib/offline/queue';

const mockUpdatePages = jest.fn(async () => undefined);
const mockPages = Array.from({ length: 604 }, (_, i) => ({ pageNumber: i + 1, status: i < 3 ? 'memorized' : 'not_memorized', dateMemorized: null }));

jest.mock('../../../src/context/AppContext', () => ({
  useApp: () => ({ user: { id: 'u1' }, pages: mockPages, updatePages: (...args: unknown[]) => (mockUpdatePages as unknown as (...a: unknown[]) => unknown)(...args) }),
}));
jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('../../../src/lib/offline/queue', () => ({ queueChange: jest.fn(async () => undefined), currentAccount: () => null }));
jest.mock('../../../src/services/firestoreService', () => ({ getReadingSessionsForDay: jest.fn(async () => []) }));
jest.mock('../../../src/components/memorization/RangePickerSheet', () => ({ RangePickerSheet: () => null }));
jest.mock('../../../src/components/v2/Sheet', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    Sheet: ({ children, right }: { children: React.ReactNode; right?: { label: string; onPress: () => void; disabled?: boolean } }) =>
      React.createElement(
        View,
        null,
        children,
        right
          ? React.createElement(Pressable, { testID: 'sheet-right', disabled: right.disabled, onPress: right.onPress }, React.createElement(Text, null, right.label))
          : null,
      ),
  };
});

/** An element's text, children flattened. */
function flatText(el: { props: { children?: unknown } }): string {
  const walk = (c: unknown): string => (typeof c === 'string' || typeof c === 'number' ? String(c) : Array.isArray(c) ? c.map(walk).join('') : c && typeof c === 'object' && 'props' in (c as object) ? walk((c as { props: { children?: unknown } }).props.children) : '');
  return walk(el.props.children);
}

/** Whole pages: `which` row's wheel (opened if it isn't), then the row for `page`. */
function pickPage(screen: ReturnType<typeof render>, which: 'from' | 'to', page: number) {
  if (!screen.queryByTestId(`add-memorized-${which}-picker`)) fireEvent.press(screen.getByTestId(`add-memorized-${which}`));
  fireEvent.press(screen.getByTestId(`add-memorized-${which}-picker-page-${page}`));
}

/** What a From or To row says, as VoiceOver reads it. */
const rowSays = (screen: ReturnType<typeof render>, which: 'from' | 'to') => plainText(screen.getByTestId(`add-memorized-${which}`).props.accessibilityLabel);

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('Memorized add sheet (ACT-5)', () => {
  beforeEach(() => {
    (queueChange as unknown as jest.Mock).mockClear();
    mockUpdatePages.mockClear();
  });

  it('[ACT-5] marks the pages memorized and records a Memorized item for the day', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    // It opens on Ayahs (MEM-1); pages are the Whole pages tab.
    fireEvent.press(screen.getByTestId('add-memorized-tab-pages'));
    pickPage(screen, 'from', 21);
    pickPage(screen, 'to', 25);
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(queueChange).toHaveBeenCalledWith({ kind: 'memorization.mark', day: '2026-11-03', pages: [21, 22, 23, 24, 25], at: expect.any(Number) });
    const [changed, numbers] = mockUpdatePages.mock.calls[0] as unknown as [{ pageNumber: number; status: string }[], number[]];
    expect(numbers).toEqual([21, 22, 23, 24, 25]);
    expect(changed.filter((p) => p.pageNumber >= 21 && p.pageNumber <= 25).every((p) => p.status === 'memorized')).toBe(true);
  });

  it('[ACT-5] a range already memorized writes no page change, and still records the day', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    // It opens on Ayahs (MEM-1); pages are the Whole pages tab.
    fireEvent.press(screen.getByTestId('add-memorized-tab-pages'));
    pickPage(screen, 'from', 1);
    pickPage(screen, 'to', 3);
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(mockUpdatePages).not.toHaveBeenCalled();
    expect(queueChange).toHaveBeenCalledTimes(1);
  });

  it('[ACT-5] minutes typed go with the day’s Memorized item; none typed sends none', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    // It opens on Ayahs (MEM-1); pages are the Whole pages tab.
    fireEvent.press(screen.getByTestId('add-memorized-tab-pages'));
    pickPage(screen, 'from', 562);
    pickPage(screen, 'to', 562);
    fireEvent.changeText(screen.getByTestId('add-memorized-minutes'), '25');
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(queueChange).toHaveBeenCalledWith({ kind: 'memorization.mark', day: '2026-11-03', pages: [562], at: expect.any(Number), minutes: 25 });
  });

  it('[ACT-5] Whole pages opens on the first page not yet memorized; its wheel names each page’s surah, and To is never before From', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" />);
    await flush();
    fireEvent.press(screen.getByTestId('add-memorized-tab-pages'));
    // Pages 1 to 3 are memorized: it opens on page 4, one page.
    expect(rowSays(screen, 'from')).toBe('From, Page 4 · Al-Baqarah');
    expect(rowSays(screen, 'to')).toBe('To, Page 4 · Al-Baqarah');
    expect(plainText(flatText(screen.getByTestId('add-memorized-pages')))).toBe('Al-Baqarah 17–24 · 1 page');
    // The wheel's rows: the page, then the surah it starts in.
    fireEvent.press(screen.getByTestId('add-memorized-from'));
    expect(plainText(flatText(screen.getByTestId('add-memorized-from-picker-page-542')))).toBe('542 · Al-Mujadila');
    // From past To takes To with it.
    pickPage(screen, 'from', 562);
    expect(rowSays(screen, 'to')).toBe('To, Page 562 · Al-Mulk');
    // To's wheel starts at From: no page before it.
    fireEvent.press(screen.getByTestId('add-memorized-to'));
    expect(screen.queryByTestId('add-memorized-to-picker-page-561')).toBeNull();
    expect(screen.getByTestId('add-memorized-to-picker-page-562')).toBeTruthy();
    pickPage(screen, 'to', 564);
    expect(plainText(flatText(screen.getByTestId('add-memorized-pages')))).toBe('Al-Mulk to Al-Qalam 15 · 3 pages');
  });

  it('[MEM-5] from a sitting, Whole pages keeps to the pages it held', async () => {
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" sitting={{ pages: [562, 563], minutes: 41 }} />);
    await flush();
    fireEvent.press(screen.getByTestId('add-memorized-tab-pages'));
    // From the first page not memorized there to the sitting's last page.
    expect(rowSays(screen, 'from')).toBe('From, Page 562 · Al-Mulk');
    expect(rowSays(screen, 'to')).toBe('To, Page 563 · Al-Mulk');
    fireEvent.press(screen.getByTestId('add-memorized-from'));
    expect(screen.queryByTestId('add-memorized-from-picker-page-561')).toBeNull();
    expect(screen.queryByTestId('add-memorized-from-picker-page-564')).toBeNull();
    pickPage(screen, 'from', 563);
    expect(rowSays(screen, 'to')).toBe('To, Page 563 · Al-Mulk');
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    expect(queueChange).toHaveBeenCalledWith({ kind: 'memorization.mark', day: '2026-11-03', pages: [563], at: expect.any(Number), minutes: 41 });
  });

  it('[MEM-1] from a sitting it opens on Ayahs inside the pages it held; To set to where it stopped adds a page and the top of the next', async () => {
    const onAdded = jest.fn();
    const screen = render(<AddMemorizedSheet visible onClose={jest.fn()} day="2026-11-03" sitting={{ pages: [562, 563], minutes: 41 }} onAdded={onAdded} />);
    await flush();
    const words = () => plainText(flatText(screen.getByTestId('add-memorized-ayahs')));
    // From the first ayah not memorized to the end of the sitting's pages.
    expect(words()).toBe('Al-Mulk 1–26 · 26 ayahs');
    fireEvent.press(screen.getByTestId('add-memorized-to-ayah'));
    fireEvent.press(screen.getByTestId('add-memorized-to-ayah-picker-ayah-20'));
    expect(words()).toBe('Al-Mulk 1–20 · 20 ayahs');
    expect(flatText(screen.getByTestId('add-memorized-share'))).toMatch(/^Memorized on today: 0\.5% → 0\.8% of the Quran$/);
    fireEvent.press(screen.getByTestId('sheet-right'));
    await flush();
    const alMulk = Array.from({ length: 20 }, (_, i) => 67001 + i);
    expect(queueChange).toHaveBeenCalledWith({ kind: 'memorization.mark', day: '2026-11-03', pages: [562, 563], verses: alMulk, at: expect.any(Number), minutes: 41 });
    const [next, numbers] = mockUpdatePages.mock.calls[0] as unknown as [{ pageNumber: number; status: string; verses?: number[] | null }[], number[]];
    expect(numbers).toEqual([562, 563]);
    expect(next.find((p) => p.pageNumber === 562)).toMatchObject({ status: 'memorized', verses: null });
    expect(next.find((p) => p.pageNumber === 563)).toMatchObject({ status: 'in_progress', verses: alMulk.slice(12) });
    expect(onAdded).toHaveBeenCalledWith({ ayahs: alMulk, pages: [562, 563], previous: [mockPages[561], mockPages[562]] });
  });
});
