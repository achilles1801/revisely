import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return {
    Ionicons: ({ name, color, testID }: { name: string; color?: string; testID?: string }) => (
      <Text testID={testID ?? `icon-${name}`} style={{ color }}>{name}</Text>
    ),
  };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('@react-native-community/slider', () => {
  const { View } = require('react-native');
  return (props: object) => <View {...props} />;
});
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 21.4, longitude: 39.8 } })),
  Accuracy: { Balanced: 3 },
}));
jest.mock('../../../lib/notifications', () => ({
  ensureNotificationsPermission: jest.fn(async () => true),
  scheduleDailyReminder: jest.fn(async () => undefined),
}));
// The browser has its own owner and tests; here it only has to be there.
jest.mock('../../../components/MemorizationBrowser', () => {
  const { Text } = require('react-native');
  return { MemorizationBrowser: () => <Text testID="memorization-browser">browser</Text> };
});

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
const mockRoute: { key: string; params: { journeyStage: 'in_progress' | 'complete' } } = {
  key: 'r1',
  params: { journeyStage: 'in_progress' },
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => mockRoute,
}));

const mockApp: Record<string, unknown> = {};
jest.mock('../../../context/AppContext', () => ({ useApp: () => mockApp }));
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({ firebaseUser: { displayName: 'Aisha' } }),
}));

import WelcomeScreen from '../WelcomeScreen';
import JourneySelectScreen from '../JourneySelectScreen';
import JuzSelectionScreen from '../JuzSelectionScreen';
import ScheduleScreen from '../ScheduleScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { GlassCard } from '../../../components/GlassCard';
import { Button } from '../../../components/Button';
import { LiquidGlassSegmentedControl } from '../../../components/LiquidGlassSegmentedControl';
import { PillButton } from '../../../components/v2/PillButton';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import type { UserPage } from '../../../types';

// A new user hasn't chosen an accent: Indigo.
const light = paletteV2(false, DEFAULT_ACCENT);

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{ allowed: true, chosen: 'new' }}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);
const classic = (ui: React.ReactElement) => <ThemeProvider>{ui}</ThemeProvider>;

async function show(ui: React.ReactElement) {
  render(ui);
  await act(async () => {});
}

const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));
const styleOf = (id: string) => flat(screen.getByTestId(id).props.style);

function page(pageNumber: number, status: UserPage['status'] = 'not_memorized'): UserPage {
  return {
    pageNumber,
    status,
    dateMemorized: null,
    weaknessRating: 4,
    lastRevisedDate: null,
    totalRevisionCount: 0,
    skipCount: 0,
  };
}

/** No glass, no classic button or segmented control: the new design's pieces only. */
function expectFlat() {
  expect(screen.UNSAFE_queryAllByType(GlassCard)).toHaveLength(0);
  expect(screen.UNSAFE_queryAllByType(Button)).toHaveLength(0);
  expect(screen.UNSAFE_queryAllByType(LiquidGlassSegmentedControl)).toHaveLength(0);
}

/** The primary action: a solid pill in the accent's primary fill. */
function expectPrimary(testID: string, title: string) {
  const pill = screen.UNSAFE_getAllByType(PillButton).find((p) => p.props.testID === testID);
  expect(pill?.props.title).toBe(title);
  expect(pill?.props.variant ?? 'solid').toBe('solid');
  expect(pill?.props.size).toBe('lg');
  expect(styleOf(testID).backgroundColor).toBe(light.primary);
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  mockRoute.params = { journeyStage: 'in_progress' };
  mockApp.user = { memorizedSurahs: [], reminderTime: '08:00', notificationsEnabled: true };
  mockApp.pages = [page(1), page(2, 'memorized'), page(3, 'memorized')];
  mockApp.updatePages = jest.fn(async () => undefined);
  mockApp.saveUser = jest.fn(async () => undefined);
  mockApp.completeOnboarding = jest.fn(async () => undefined);
  mockApp.createDefaultUser = jest.fn((o: object) => ({ reminderTime: '08:00', notificationsEnabled: true, ...o }));
});

describe('<WelcomeScreen /> in the new design', () => {
  it('a flat ground with the accent glow, the accent word, and Begin as the solid pill', async () => {
    await show(v2(<WelcomeScreen />));
    expect(styleOf('welcome').backgroundColor).toBe(light.bg);
    // Indigo has a glow; it draws behind and takes no touches.
    expect(screen.getByTestId('hero-glow').props.pointerEvents).toBe('none');
    expect(screen.getByText(/Your Quran,/)).toBeTruthy();
    expect(styleOf('welcome-accent').color).toBe(light.accentText);
    expectPrimary('welcome-begin', 'Begin');
    expectFlat();

    fireEvent.press(screen.getByTestId('welcome-begin'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JourneySelect');
    // Taps don't buzz in the new design.
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('Jade has no glow', async () => {
    render(
      <DesignProvider initial={{ allowed: true, chosen: 'new', accent: 'jade' }}>
        <ThemeProvider>
          <WelcomeScreen />
        </ThemeProvider>
      </DesignProvider>,
    );
    await act(async () => {});
    expect(screen.queryByTestId('hero-glow')).toBeNull();
    expect(styleOf('welcome-accent').color).toBe(paletteV2(false, 'jade').accentText);
  });

  it('the classic screen is unchanged', async () => {
    await show(classic(<WelcomeScreen />));
    expect(screen.queryByTestId('welcome')).toBeNull();
    expect(screen.UNSAFE_getAllByType(Button)).toHaveLength(1);
    expect(screen.UNSAFE_queryAllByType(PillButton)).toHaveLength(0);
  });
});

describe('<JourneySelectScreen /> in the new design', () => {
  it('a top bar with back and step 1 of 3; the two answers as radio rows; Continue at the foot', async () => {
    await show(v2(<JourneySelectScreen />));
    expect(styleOf('journey-select').backgroundColor).toBe(light.bg);
    expect(screen.getByLabelText('Step 1 of 3')).toBeTruthy();
    expect(styleOf('step-1')).toMatchObject({ backgroundColor: light.primary, width: 24 });
    expect(styleOf('step-2')).toMatchObject({ backgroundColor: light.separator, width: 8 });
    expectPrimary('journey-continue', 'Continue');
    expectFlat();

    // In progress is chosen to begin with: a check in the accent text colour.
    const inProgress = screen.getByTestId('journey-in_progress');
    expect(inProgress.props.accessibilityState).toMatchObject({ checked: true });
    expect(flat(screen.getByTestId('journey-in_progress-checked').props.style).color).toBe(light.accentText);
    // Rows sit on hairlines.
    expect(styleOf('journey-complete')).toMatchObject({ borderBottomColor: light.separator, borderBottomWidth: 0.5 });

    fireEvent.press(screen.getByTestId('journey-complete'));
    expect(screen.getByTestId('journey-complete').props.accessibilityState).toMatchObject({ checked: true });
    expect(screen.getByTestId('journey-in_progress').props.accessibilityState).toMatchObject({ checked: false });
    // A choice is an outcome: a selection tick (Settings → Haptics allows it).
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('journey-continue'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JuzSelection', { journeyStage: 'complete' });
    fireEvent.press(screen.getByTestId('back'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('the classic screen keeps its glass cards', async () => {
    await show(classic(<JourneySelectScreen />));
    expect(screen.queryByTestId('journey-select')).toBeNull();
    expect(screen.UNSAFE_getAllByType(GlassCard)).toHaveLength(2);
  });
});

describe('<JuzSelectionScreen /> in the new design', () => {
  it('step 2 of 3, the browser, then the count and Continue over a hairline', async () => {
    await show(v2(<JuzSelectionScreen />));
    expect(styleOf('juz-selection').backgroundColor).toBe(light.bg);
    expect(screen.getByLabelText('Step 2 of 3')).toBeTruthy();
    // The step behind is done; this one is the primary fill.
    expect(styleOf('step-1').backgroundColor).toBe(light.done);
    expect(styleOf('step-2')).toMatchObject({ backgroundColor: light.primary, width: 24 });
    expect(screen.getByText('Select memorized portions')).toBeTruthy();
    expect(screen.getByText('Mark your completed surahs and juz.')).toBeTruthy();
    expect(screen.getByTestId('memorization-browser')).toBeTruthy();
    expect(styleOf('juz-selection-footer')).toMatchObject({ borderTopColor: light.separator, borderTopWidth: 0.5 });
    expectPrimary('juz-continue', 'Continue');
    expectFlat();

    // In progress starts from page 1 alone.
    expect(screen.getByText('1')).toBeTruthy();
    expect(flat(screen.getByText('1').props.style).color).toBe(light.accentText);

    await act(async () => {
      fireEvent.press(screen.getByTestId('juz-continue'));
    });
    expect(mockApp.updatePages).toHaveBeenCalled();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Schedule', { journeyStage: 'in_progress' });
  });

  it('nothing marked: Continue is off', async () => {
    mockApp.pages = [];
    await show(v2(<JuzSelectionScreen />));
    expect(screen.getByTestId('juz-continue').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('Complete: everything starts marked', async () => {
    mockRoute.params = { journeyStage: 'complete' };
    await show(v2(<JuzSelectionScreen />));
    expect(screen.getByText('All marked as memorized — adjust if needed.')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('the classic screen keeps its glass footer', async () => {
    await show(classic(<JuzSelectionScreen />));
    expect(screen.queryByTestId('juz-selection')).toBeNull();
    expect(screen.UNSAFE_getAllByType(GlassCard)).toHaveLength(1);
  });
});

describe('<ScheduleScreen /> in the new design', () => {
  it('flat sections: Pages or Juz as pills, the reset as pills, reminders as a row; Start at the foot', async () => {
    await show(v2(<ScheduleScreen />));
    expect(styleOf('schedule').backgroundColor).toBe(light.bg);
    expect(screen.getByLabelText('Step 3 of 3')).toBeTruthy();
    expect(screen.getByText('Set your rhythm')).toBeTruthy();
    expectPrimary('schedule-start', 'Start');
    expectFlat();
    // No ⓘ: a subtitle says it instead.
    expect(screen.queryByTestId('icon-information-circle-outline')).toBeNull();
    expect(screen.getByText('You can change any of these later in Settings.')).toBeTruthy();

    // Pages: 10 a day to begin with, the slider in the primary fill.
    expect(screen.getByTestId('pill-pages').props.accessibilityLabel).toBe('Pages, selected');
    expect(screen.getByTestId('schedule-amount').props.children).toBe(10);
    const slider = screen.getByTestId('schedule-slider').props;
    expect([slider.minimumTrackTintColor, slider.maximumTrackTintColor, slider.maximumValue]).toEqual([
      light.primary,
      light.separator,
      60,
    ]);
    // Two pages memorized at 10 a day: one day.
    expect(screen.getByTestId('schedule-cycle').props.children).toBe('Full revision cycle: ~1 day');

    fireEvent(screen.getByTestId('schedule-slider'), 'valueChange', 1);
    expect(screen.getByTestId('schedule-amount').props.children).toBe(1);
    expect(screen.getByTestId('schedule-cycle').props.children).toBe('Full revision cycle: ~2 days');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByTestId('pill-juz'));
    expect(screen.getByTestId('schedule-amount').props.children).toBe(1);
    expect(screen.getByText('juz')).toBeTruthy();
    expect(screen.getByTestId('schedule-slider').props.maximumValue).toBe(5);

    // The day resets at fajr unless changed.
    expect(screen.getByTestId('pill-fajr').props.accessibilityLabel).toBe('At fajr, selected');
    expect(screen.getByText("We'll ask for your location to compute fajr accurately.")).toBeTruthy();
    fireEvent.press(screen.getByTestId('pill-midnight'));
    expect(screen.queryByText("We'll ask for your location to compute fajr accurately.")).toBeNull();

    fireEvent(screen.getByTestId('schedule-reminders'), 'valueChange', false);
    expect(screen.getByTestId('schedule-reminders').props.value).toBe(false);

    await act(async () => {
      fireEvent.press(screen.getByTestId('schedule-start'));
    });
    expect(mockApp.createDefaultUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Aisha',
        scheduleMode: 'juz',
        dailyJuzCount: 1,
        dailyPageCapacity: 1,
        notificationsEnabled: false,
        fajrBoundaryEnabled: false,
      }),
    );
    expect(mockApp.saveUser).toHaveBeenCalled();
    expect(mockApp.completeOnboarding).toHaveBeenCalled();
    // Done: the success haptic.
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('s');
  });

  it('Complete is a maintenance schedule of 20 pages', async () => {
    mockRoute.params = { journeyStage: 'complete' };
    await show(v2(<ScheduleScreen />));
    expect(screen.getByText('Set your maintenance schedule')).toBeTruthy();
    expect(screen.getByTestId('schedule-amount').props.children).toBe(20);
  });

  it('haptics follow Settings → Haptics in the new design', async () => {
    render(
      <DesignProvider initial={{ allowed: true, chosen: 'new', hapticsOn: false }}>
        <ThemeProvider>
          <ScheduleScreen />
        </ThemeProvider>
      </DesignProvider>,
    );
    await act(async () => {});
    fireEvent(screen.getByTestId('schedule-slider'), 'valueChange', 30);
    await act(async () => {
      fireEvent.press(screen.getByTestId('schedule-start'));
    });
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(mockApp.completeOnboarding).toHaveBeenCalled();
  });

  it('the classic screen keeps its segmented control and always buzzes', async () => {
    await show(classic(<ScheduleScreen />));
    expect(screen.queryByTestId('schedule')).toBeNull();
    expect(screen.UNSAFE_getAllByType(LiquidGlassSegmentedControl)).toHaveLength(1);
    expect(screen.getByTestId('icon-information-circle-outline')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Start'));
    });
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('s');
  });
});
