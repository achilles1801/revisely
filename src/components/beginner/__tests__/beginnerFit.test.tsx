// The beginner path's words stay whole (BEHAVIOUR.md BEGIN-1 to BEGIN-3, and the section's last line; Majd, Nov 27 2026:
// every UI brief checks 0, 1, a few and many, the longest values, an SE and a Pro Max, the largest text): widths measured
// with the system font's own advances (jest/textWidth) against the room the screens give them, and the rows themselves:
// nothing that could clip is capped to a number of lines, and nothing is placed by left or right (Arabic flips them).
import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { textWidth } from '../../../../jest/textWidth';
import { paletteV2 } from '../../../theme/v2';
import { BEGINNER_SURAHS } from '../../../lib/beginner/surahs';
import { surahNameIn } from '../../../lib/passages';
import { t } from '../../../i18n';
import { ShortSurahList, SURAH_CHECK, SURAH_ROW_MAX_SCALE } from '../ShortSurahList';
import { BeginnerQuietLine, beginnerRing } from '../BeginnerToday';
import type { TodayLines } from '../../../lib/todayLines';

const mockPalette = paletteV2(false, 'indigo');
jest.mock('../../../context/ThemeContext', () => ({ useTheme: () => ({ palette: mockPalette, theme: mockPalette, isDark: false }) }));
jest.mock('@expo/vector-icons', () => {
  const { Text: T } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T>{name}</T> };
});

/** An iPhone SE's width and a Pro Max's (Majd's phone, 440pt), and the screens' gutter (layoutV2.gutter). */
const SE = 320;
const PRO_MAX = 440;
const GUTTER = 16;
const GAP = 12;
/** The ring's lines: the body's side padding (TodayRing: 24 each side), two lines, shrinking to 0.7 at most. */
const RING_PAD = 24;
const RING_LINES = 2;
const RING_MIN_SCALE = 0.7;
const RING_MAX_SCALE = 1.6;

/** A body line (15pt) from the 13pt widths: an upper bound, as the table errs wide. */
const bodyWidth = (s: string) => textWidth(s, 'meta@13') * (15 / 13);

describe('[BEGIN-1] a surah’s row on an SE and a Pro Max, up to the largest text', () => {
  it('every surah’s name fits one line beside its check at the usual size on an SE, and its count under it', () => {
    // The Arabic name beside it takes at most about 90pt (الانفطار, 18pt Amiri, at 1.4).
    const room = SE - 2 * GUTTER - SURAH_CHECK - 2 * GAP - 90;
    for (const sura of BEGINNER_SURAHS) {
      const name = surahNameIn(sura);
      expect({ name, fits: textWidth(name, 'title@17') <= room }).toEqual({ name, fits: true });
      const count = t('beginner.surahs.ayahs', { count: 46 });
      expect(textWidth(count, 'meta@13', SURAH_ROW_MAX_SCALE) <= room).toBe(true);
    }
    // On a Pro Max, even at the largest text.
    const wide = PRO_MAX - 2 * GUTTER - SURAH_CHECK - 2 * GAP - 90;
    for (const sura of BEGINNER_SURAHS) expect(textWidth(surahNameIn(sura), 'title@17', SURAH_ROW_MAX_SCALE) <= wide).toBe(true);
  });

  it('at the largest text a long name wraps whole and never clips: no row text is held to a number of lines', () => {
    render(<ShortSurahList chosen={new Set([1, 114])} locked={new Set([1])} onToggle={() => undefined} testID="row" />);
    for (const sura of BEGINNER_SURAHS) {
      const name = screen.getByTestId(`row-${sura}-name`);
      expect(name.props.numberOfLines).toBeUndefined();
      expect(name.props.maxFontSizeMultiplier).toBe(SURAH_ROW_MAX_SCALE);
      // Its column takes the room left and may shrink below its words (they wrap), so the Arabic stays on the row.
      const column = StyleSheet.flatten(name.parent?.parent?.props.style);
      expect(column).toMatchObject({ flex: 1, minWidth: 0 });
    }
    for (const el of screen.UNSAFE_getAllByType(Text)) expect(el.props.numberOfLines).toBeUndefined();
  });

  it('nothing is placed by left or right, so an Arabic row mirrors whole (LANG)', () => {
    render(<ShortSurahList chosen={new Set()} onToggle={() => undefined} testID="row" />);
    const row = screen.getByTestId('row-112');
    const styles = [StyleSheet.flatten(row.props.style), ...row.findAll(() => true).map((n: { props: { style?: unknown } }) => StyleSheet.flatten((n.props.style ?? {}) as never))];
    for (const style of styles) {
      expect(Object.keys(style ?? {}).filter((k) => /^(left|right)$|Left$|Right$/.test(k))).toEqual([]);
    }
  });

  it('none, one, a few and all ticked: the count says so', () => {
    expect(t('beginner.surahs.none', { surah: surahNameIn(1) })).toBe('None yet? That’s fine. You’ll start with Al-Fatihah.');
    expect(t('beginner.surahs.chosen', { count: 1 })).toBe('1 surah chosen');
    expect(t('beginner.surahs.chosen', { count: 7 })).toBe('7 surahs chosen');
    expect(t('beginner.surahs.chosen', { count: 38 })).toBe('38 surahs chosen');
  });
});

const lines = (over: Partial<TodayLines> = {}): TodayLines => ({
  title: { text: 'Starts at Al-Fatihah', dot: false, chevron: true },
  detail: { kind: 'text', text: '3 pages · then An-Nas to Al-Kafirun' },
  brief: 'then An‑Nas to Al‑Kafirun',
  total: 3,
  label: 'Starts at Al-Fatihah. then An-Nas to Al-Kafirun',
  empty: false,
  cta: 'Start revision',
  solid: true,
  ...over,
});
const nothing = lines({
  title: { text: 'Nothing to revise yet', dot: false, chevron: false },
  brief: 'Mark the pages you know',
  total: 0,
  empty: true,
  cta: 'Mark memorized pages',
});

describe('[BEGIN-2] [BEGIN-3] the ring’s beginner lines fit their two lines on an SE at the largest text', () => {
  const room = (SE - 2 * RING_PAD) * RING_LINES;

  it('Start with Al-Fatihah: its words, never shrunk past what the ring allows', () => {
    const ring = beginnerRing({ lines: nothing, status: 'not_started', minutes: 0, onStart: () => undefined, onSurahs: () => undefined });
    expect(ring.lines.title.text).toBe('Start with Al-Fatihah');
    expect(ring.lines.cta).toBe('Open Al-Fatihah');
    expect(ring.onPrimary).toBeDefined();
    // At the largest text the line shrinks to fit (adjustsFontSizeToFit), but never below 0.7 of it: it must fit there.
    expect(bodyWidth(ring.lines.brief) * RING_MAX_SCALE * RING_MIN_SCALE).toBeLessThanOrEqual(room);
    expect(bodyWidth(ring.lines.brief)).toBeLessThanOrEqual(room);
  });

  it('with surahs: today’s lines with about how long after them, and “Change” still fits', () => {
    const ring = beginnerRing({ lines: lines(), status: 'not_started', minutes: 4, onStart: () => undefined, onSurahs: () => undefined });
    expect(ring.lines.brief.replace(/[ ‑]/g, (c) => (c === ' ' ? ' ' : '-'))).toBe('then An-Nas to Al-Kafirun · about 4 min');
    expect(ring.onPrimary).toBeUndefined();
    const line = `${ring.lines.brief} · ${t('home.today.change')}`;
    expect(bodyWidth(line) * RING_MAX_SCALE * RING_MIN_SCALE).toBeLessThanOrEqual(room);
  });

  it('no time once today is done, on a rest day, or with nothing left', () => {
    for (const ring of [
      beginnerRing({ lines: lines(), status: 'completed', minutes: 4, onStart: () => undefined, onSurahs: () => undefined }),
      beginnerRing({ lines: lines({ rest: true, empty: true }), status: 'not_started', minutes: 4, onStart: () => undefined, onSurahs: () => undefined }),
      beginnerRing({ lines: lines(), status: 'partial', minutes: 0, onStart: () => undefined, onSurahs: () => undefined }),
    ]) {
      expect(ring.lines.brief).not.toMatch(/min/);
    }
  });

  it('a rest day keeps its own words, not the new account’s', () => {
    const rest = lines({ title: { text: 'Rest day', dot: false, chevron: false }, rest: true, empty: true, cta: 'Revise ahead' });
    expect(beginnerRing({ lines: rest, status: 'not_started', minutes: 0, onStart: () => undefined, onSurahs: () => undefined }).lines.title.text).toBe(
      'Rest day',
    );
  });

  it('the quiet lines wrap, never clip, and keep their action whole', () => {
    render(<BeginnerQuietLine lead={t('beginner.home.markLead')} action={t('beginner.home.mark')} onPress={() => undefined} testID="q" />);
    for (const el of screen.UNSAFE_getAllByType(Text)) expect(el.props.numberOfLines).toBeUndefined();
    expect(screen.getByTestId('q-action').props.children).toBe('Mark them');
  });
});
