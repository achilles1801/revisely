// Every mark drawn in a ring, a disc or a badge sits in its centre (jest/rings.ts). The Calendar's day card drew its
// done check at the ring's top-left corner, cut by the ring (Majd, Nov 26 2026: "check mark bug still here. make sure
// this doesn't happen anywhere in the app."). The shared rings, discs and badges are here, light and dark; the
// session's end card and Pages sheet are checked in their own tests.
import React from 'react';
import fs from 'fs';
import path from 'path';
import { render } from '@testing-library/react-native';
import { Ionicons } from '@expo/vector-icons';
import { boxedMarks, offCentreMarks } from '../../../jest/rings';

let mockDark = false;
jest.mock('../../context/ThemeContext', () => {
  const { paletteV2 } = require('../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(mockDark), theme: {}, isDark: mockDark }) };
});

import { ProgressRing } from '../activity/DayParts';
import { BlockMark, RevisedMark } from '../activity/BlockMark';
import { DayEntry } from '../activity/DayEntry';
import { Mark } from '../v2/Mark';
import { CheckMark } from '../reciteLive/ReciteMic';

// The icon draws an empty text until its font has loaded, so it's found by its element, not its testID.
const ringCheck = (screen: ReturnType<typeof render>) => screen.UNSAFE_queryAllByType(Ionicons).filter((i) => i.props.testID === 'progress-ring-check');

function marks(ui: React.ReactElement) {
  const screen = render(ui);
  return { screen, off: offCentreMarks(screen.UNSAFE_root as never, Ionicons), boxed: boxedMarks(screen.UNSAFE_root as never, Ionicons) };
}

describe.each([false, true])('a mark sits in the centre of its ring (dark: %s)', (isDark) => {
  beforeEach(() => {
    mockDark = isDark;
  });

  it.each([18, 40, 44])("ProgressRing's done check at %ipt: centred, inside the ring", (size) => {
    const { screen, off, boxed } = marks(<ProgressRing fraction={1} done size={size} />);
    expect(ringCheck(screen)).toHaveLength(1);
    expect(boxed).toBe(1);
    expect(off).toEqual([]);
    // About half the ring, inside its 3pt stroke.
    const check = screen.UNSAFE_getByType(Ionicons);
    expect(check.props.size).toBeLessThanOrEqual(size - 2 * 3);
    expect(screen.getByLabelText('Revised, done')).toBeTruthy();
  });

  it('a ring not yet done draws no check', () => {
    const { screen } = marks(<ProgressRing fraction={0.5} done={false} size={44} />);
    expect(ringCheck(screen)).toHaveLength(0);
    expect(screen.getByLabelText('50 percent revised')).toBeTruthy();
  });

  it("the Calendar's day card: a done day's ring has its check in the centre (Majd's screenshot)", () => {
    const { screen, off, boxed } = marks(
      <DayEntry
        date="Sunday 22 November"
        lines={[]}
        note={null}
        onOpen={() => {}}
        onAddNote={() => {}}
        showNote={false}
        ring={{ share: 1, figure: '2 pages', detail: 'Maryam, 6th to 7th page' }}
        extras={[{ key: 'memorized', text: '1 page memorized' }]}
      />,
    );
    expect(ringCheck(screen)).toHaveLength(1);
    expect(boxed).toBeGreaterThanOrEqual(1);
    expect(off).toEqual([]);
  });

  it.each([
    ['RevisedMark, done', <RevisedMark key="a" fraction={1} done />],
    ['RevisedMark, part done', <RevisedMark key="b" fraction={0.4} done={false} size={26} />],
    ['BlockMark', <BlockMark key="c" kind="memorized" />],
    ['Mark, done (top)', <Mark key="d" done size="top" />],
    ['Mark, done (nested)', <Mark key="e" done size="nested" />],
    ['Mark with an icon', <Mark key="f" icon="mic-outline" size="reply" />],
    ["Recite's check mark, locked", <CheckMark key="g" size={24} locked />],
  ])('%s', (_name, ui) => {
    const { off, boxed } = marks(ui);
    expect(boxed).toBeGreaterThanOrEqual(1);
    expect(off).toEqual([]);
  });
});

describe('offCentreMarks catches the bug it was written for', () => {
  const { View } = require('react-native');
  const Svg = require('react-native-svg').default;
  const { StyleSheet } = require('react-native');

  it('an icon given absoluteFill over an in-flow ring (the day card before the fix)', () => {
    const screen = render(
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }} testID="ring">
        <Svg width={44} height={44} />
        <Ionicons name="checkmark" size={18} style={StyleSheet.absoluteFill} />
      </View>,
    );
    expect(offCentreMarks(screen.UNSAFE_root as never, Ionicons)).toEqual(['checkmark in ring: the icon is absolute', 'checkmark in ring: something else in the box is in flow']);
  });

  it('a box that does not centre, and an icon larger than its box', () => {
    const screen = render(
      <View style={{ width: 16, height: 16 }} testID="badge">
        <Ionicons name="checkmark" size={20} />
      </View>,
    );
    expect(offCentreMarks(screen.UNSAFE_root as never, Ionicons)).toEqual(["checkmark in badge: the box doesn't centre it", 'checkmark in badge: the icon is larger than the box']);
  });
});

describe('no icon anywhere in the app is placed absolutely by its own style', () => {
  // An icon is text: absolute, its glyph sits at its box's top start, not where it was meant to. Centre it in a box
  // instead (the box may be absolute).
  function files(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : files(p);
      return p.endsWith('.tsx') ? [p] : [];
    });
  }

  it('finds none in src/', () => {
    const root = path.join(__dirname, '..', '..');
    const found: string[] = [];
    for (const file of files(root)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/<Ionicons\b[^>]*?(absoluteFill|position:\s*'absolute')[^>]*?\/>/gs)) {
        const line = text.slice(0, m.index).split('\n').length;
        found.push(`${path.relative(root, file)}:${line}`);
      }
    }
    expect(found).toEqual([]);
  });
});
