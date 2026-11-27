// What's new 1.0.6, the tour: each card a slide that plays by itself; Skip jumps it to its words and Next (the
// orchestrator's pick, Nov 26 2026); Reduce Motion and VoiceOver go there at once; the Ramadan slide spares the phone the
// theme's own card (THEME-7).

import React from 'react';
import { AccessibilityInfo, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
let mockReduce = false;
jest.mock('../../../design/motion', () => ({ ...jest.requireActual('../../../design/motion'), useReduceMotion: () => mockReduce }));
const mockApp = { user: { id: 'u1', previewTester: true, name: 'Maryam' }, pages: [] };
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

import { Slide, TourMoment } from '../tour/TourMoment';
import { StageScale } from '../tour/parts';
import { TOUR_SECONDS } from '../../../lib/whatsNew/tour';
import { useSharedValue } from 'react-native-reanimated';
import { TOUR_MOMENTS, type TourMoment as TourMomentId } from '../../../lib/help/whatsNew';
import { RAMADAN_INTRO_KEY } from '../../ramadan/introKey';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DesignProvider } from '../../../design/DesignContext';

const onNext = jest.fn();
async function show(moment: TourMomentId, last = false) {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <TourMoment moment={moment} step={2} total={9} title="A slide" words={null} last={last} closable={false} onNext={onNext} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

beforeEach(async () => {
  mockReduce = false;
  onNext.mockClear();
  await AsyncStorage.clear();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});

/** A rendered element as the testing library returns it (as jest/scrollable.ts reads it). */
interface Node {
  type: unknown;
  props: Record<string, unknown>;
  parent: Node | null;
}

/** How visible a host view is: its opacity times every host ancestor's. */
function shown(node: Node): number {
  let o = 1;
  for (let n: Node | null = node; n; n = n.parent) {
    if (typeof n.type !== 'string') continue;
    const flat = StyleSheet.flatten(n.props.style as never) as { opacity?: number } | undefined;
    o *= flat?.opacity ?? 1;
  }
  return o;
}

/** The scales a host view is drawn through, its own and every host ancestor's (a scale of 1 is none). */
function scalesAbove(node: Node): number[] {
  const out: number[] = [];
  for (let n: Node | null = node; n; n = n.parent) {
    if (typeof n.type !== 'string') continue;
    const flat = StyleSheet.flatten(n.props.style as never) as { transform?: object[] } | undefined;
    for (const op of flat?.transform ?? []) {
      const scale = (op as { scale?: number }).scale;
      if (scale != null && Math.abs(scale - 1) > 1e-6) out.push(scale);
    }
  }
  return out;
}

describe('<TourMoment />', () => {
  // iOS draws text crisp under one scale and blurred or jagged under two stacked ones (Majd, Nov 27 2026: "why's the
  // quality horrendous"): the stage's scale stacked on the example screen's. Every slide's words, at its end, are drawn
  // through one scale at most, on a stage drawn smaller than its design (as on a phone).
  it.each([...TOUR_MOMENTS])('the %s slide ends with every word under one scale at most', async (moment) => {
    function AtEnd() {
      const clock = useSharedValue(TOUR_SECONDS[moment]);
      const stage = useSharedValue(0.87);
      return (
        <StageScale.Provider value={stage}>
          <Slide moment={moment} clock={clock} page={562} pageName="Al-Mulk, 1st page" />
        </StageScale.Provider>
      );
    }
    render(
      <DesignProvider initial={{}}>
        <ThemeProvider>
          <AtEnd />
        </ThemeProvider>
      </DesignProvider>,
    );
    await act(async () => {});
    // The words left showing (what has flown off or faded is gone).
    const words = (screen.UNSAFE_getAllByType(Text) as unknown as Node[]).filter((n) => shown(n) > 0.01);
    expect(words.length).toBeGreaterThan(3);
    const stacked = words.map((n) => ({ text: String(n.props.children).slice(0, 30), scales: scalesAbove(n) })).filter((w) => w.scales.length > 1);
    expect(stacked).toEqual([]);
  });

  it.each([...TOUR_MOMENTS])('the %s slide plays, and Skip jumps it to its words and Next', async (moment) => {
    await show(moment);
    expect(screen.getByTestId(`whats-new-tour-${moment}`)).toBeTruthy();
    fireEvent.press(screen.getByTestId('whats-new-tour-skip'));
    await act(async () => {});
    expect(screen.queryByTestId('whats-new-tour-skip')).toBeNull();
    expect(screen.getByTestId('whats-new-title').props.accessibilityLabel).toBe('Step 2 of 9. A slide');
    fireEvent.press(screen.getByTestId('whats-new-next'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('Reduce Motion: the slide’s end at once, its words and Next', async () => {
    mockReduce = true;
    await show('badges');
    expect(screen.queryByTestId('whats-new-tour-skip')).toBeNull();
    fireEvent.press(screen.getByTestId('whats-new-next'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('the last slide ends on Done', async () => {
    await show('ramadan', true);
    fireEvent.press(screen.getByTestId('whats-new-tour-skip'));
    await act(async () => {});
    expect(screen.getByTestId('whats-new-done')).toBeTruthy();
  });

  it('seeing the Ramadan slide marks the theme’s own card seen on this phone (THEME-7)', async () => {
    await show('ramadan', true);
    expect(await AsyncStorage.getItem(RAMADAN_INTRO_KEY)).toBeNull();
    fireEvent.press(screen.getByTestId('whats-new-tour-skip'));
    await act(async () => {});
    expect(await AsyncStorage.getItem(RAMADAN_INTRO_KEY)).toBe('1');
  });

  it('another slide leaves the theme’s card alone', async () => {
    await show('homeToday');
    fireEvent.press(screen.getByTestId('whats-new-tour-skip'));
    await act(async () => {});
    expect(await AsyncStorage.getItem(RAMADAN_INTRO_KEY)).toBeNull();
  });
});
