// What's new 1.0.6, the tour: each card a slide that plays by itself; Skip jumps it to its words and Next (the
// orchestrator's pick, Nov 26 2026); Reduce Motion and VoiceOver go there at once; the Ramadan slide spares the phone the
// theme's own card (THEME-7).

import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
let mockReduce = false;
jest.mock('../../../design/motion', () => ({ ...jest.requireActual('../../../design/motion'), useReduceMotion: () => mockReduce }));
const mockApp = { user: { id: 'u1', previewTester: true, name: 'Maryam' }, pages: [] };
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));

import { TourMoment } from '../tour/TourMoment';
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

describe('<TourMoment />', () => {
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
