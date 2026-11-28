import React from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { ensureNotificationsPermission } from '../../../lib/notifications';

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
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(async () => ({ coords: { latitude: 21.4, longitude: 39.8 } })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  Accuracy: { Balanced: 3 },
}));
jest.mock('../../../lib/notifications', () => ({
  ensureNotificationsPermission: jest.fn(async () => true),
  scheduleDailyReminder: jest.fn(async () => undefined),
}));
// The browser has its own owner and tests; here it only has to be there.
// The browser stands in for its rows; "mark Juz 2" does what its check does:
// the pages it covers go into the selection, on top of what is there.
jest.mock('../../../components/MemorizationBrowser', () => {
  const { Pressable, Text } = require('react-native');
  return {
    MemorizationBrowser: ({ pendingChanges, onChange }: { pendingChanges: Map<number, string>; onChange: (m: Map<number, string>) => void }) => (
      <>
        <Text testID="memorization-browser">browser</Text>
        <Pressable
          testID="mark-juz-2"
          onPress={() => {
            const next = new Map(pendingChanges);
            for (let p = 22; p <= 41; p++) next.set(p, 'memorized');
            onChange(next);
          }}
        />
        <Pressable
          testID="mark-page-5"
          onPress={() => {
            const next = new Map(pendingChanges);
            next.set(5, 'memorized');
            onChange(next);
          }}
        />
      </>
    ),
  };
});

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
const mockRoute: { key: string; params: Record<string, unknown> } = {
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
import DailyAmountScreen from '../DailyAmountScreen';
import DayStartScreen from '../DayStartScreen';
import ReminderScreen from '../ReminderScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { PillButton } from '../../../components/v2/PillButton';
import { juzCellSize } from '../../../components/onboarding/JuzGrid';
import { plainText } from '../../../lib/passages';
import { arabicLines, clippedArabic } from '../../../../jest/arabicLines';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';
import type { UserPage } from '../../../types';

// A new user hasn't chosen an accent: Indigo.
const light = paletteV2(false, DEFAULT_ACCENT);

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

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

const allPages = () => Array.from({ length: 604 }, (_, i) => page(i + 1));
const summary = () => plainText(String(screen.getByTestId('juz-selection-summary').props.children));
const answers = { journeyStage: 'in_progress', scheduleMode: 'pages', dailyCapacity: 10, dailyJuzCount: 1 };

describe('<WelcomeScreen />', () => {
  it('a flat ground with the accent glow, the salam, the accent word, and Begin as the solid pill', async () => {
    await show(v2(<WelcomeScreen />));
    expect(styleOf('welcome').backgroundColor).toBe(light.bg);
    // Indigo has a glow; it draws behind and takes no touches.
    expect(screen.getByTestId('hero-glow').props.pointerEvents).toBe('none');
    // The app's line (Majd, Nov 27 2026): "Closer to the Quran, one verse at a time."
    expect(screen.getByText(/Closer to the Quran,/)).toBeTruthy();
    expect(screen.getByTestId('welcome-accent')).toHaveTextContent('one verse at a time');
    expect(styleOf('welcome-accent').color).toBe(light.accentText);
    expect(screen.getByText('Takes under a minute')).toBeTruthy();
    expect(arabicLines(screen.UNSAFE_root as never)).toHaveLength(1);
    expect(clippedArabic(screen.UNSAFE_root as never)).toEqual([]);
    expectPrimary('welcome-begin', 'Begin');

    fireEvent.press(screen.getByTestId('welcome-begin'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JourneySelect');
    // Taps don't buzz in the new design.
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
  });

  it('Jade glows in light too (#62), its accent text in ink', async () => {
    render(
      <DesignProvider initial={{ accent: 'jade' }}>
        <ThemeProvider>
          <WelcomeScreen />
        </ThemeProvider>
      </DesignProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('hero-glow')).toBeTruthy();
    expect(styleOf('welcome-accent').color).toBe(paletteV2(false, 'jade').accentText);
  });
});

describe('<JourneySelectScreen />', () => {
  it('[ONBOARD-3] question 1 of 5: Part of it moves on with one tap, with no Continue', async () => {
    await show(v2(<JourneySelectScreen />));
    expect(screen.getByLabelText('Step 1 of 5')).toBeTruthy();
    expect(styleOf('step-1').backgroundColor).toBe(light.primary);
    expect(styleOf('step-2').backgroundColor).toBe(light.outline);
    expect(screen.queryByText('Continue')).toBeNull();

    fireEvent.press(screen.getByTestId('journey-part'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JuzSelection', { journeyStage: 'in_progress' });
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('back'));
    expect(mockNavigation.goBack).toHaveBeenCalled();
  });

  it('[ONBOARD-3] All of it saves every page and surah, then skips the juz', async () => {
    mockApp.pages = allPages();
    await show(v2(<JourneySelectScreen />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('journey-all'));
    });
    const [updated, changed] = (mockApp.updatePages as jest.Mock).mock.calls[0] as [UserPage[], number[]];
    expect(changed).toHaveLength(604);
    expect(updated.every((p) => p.status === 'memorized')).toBe(true);
    const saved = (mockApp.saveUser as jest.Mock).mock.calls[0][0] as { memorizedSurahs: number[] };
    expect(saved.memorizedSurahs).toHaveLength(114);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DailyAmount', { journeyStage: 'complete' });
  });

  it('[ONBOARD-1] All of it waits for pages still on their way, and saves them all', async () => {
    mockApp.pages = allPages().slice(0, 450);
    await show(v2(<JourneySelectScreen />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('journey-all'));
    });
    expect(mockApp.updatePages).not.toHaveBeenCalled();
    expect(screen.getByTestId('journey-all').props.accessibilityState).toMatchObject({ busy: true });
    expect(screen.getByText('Loading your pages…')).toBeTruthy();

    mockApp.pages = allPages();
    await act(async () => {
      screen.rerender(v2(<JourneySelectScreen />));
    });
    const [, changed] = (mockApp.updatePages as jest.Mock).mock.calls[0] as [UserPage[], number[]];
    expect(changed).toHaveLength(604);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DailyAmount', { journeyStage: 'complete' });
  });

  it('Part of it replaces an All of it still waiting for its pages', async () => {
    mockApp.pages = allPages().slice(0, 450);
    await show(v2(<JourneySelectScreen />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('journey-all'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('journey-part'));
    });
    mockApp.pages = allPages();
    await act(async () => {
      screen.rerender(v2(<JourneySelectScreen />));
    });
    expect(mockApp.updatePages).not.toHaveBeenCalled();
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('JuzSelection', { journeyStage: 'in_progress' });
  });
});

describe('<JuzSelectionScreen />', () => {
  beforeEach(() => {
    mockApp.pages = allPages();
  });

  it('[ONBOARD-4] thirty cells; Al-Fatihah starts chosen, so Juz 1 is partly chosen and says so', async () => {
    await show(v2(<JuzSelectionScreen />));
    expect(screen.getByLabelText('Step 2 of 5')).toBeTruthy();
    expect(screen.getByText('Which juz?')).toBeTruthy();
    for (let juz = 1; juz <= 30; juz++) expect(screen.getByTestId(`juz-cell-${juz}`)).toBeTruthy();
    expect(screen.getByTestId('juz-cell-1').props.accessibilityState).toMatchObject({ checked: 'mixed' });
    expect(styleOf('juz-cell-1')).toMatchObject({ backgroundColor: light.accentSubtle, borderColor: light.accentText });
    expect(screen.getByTestId('juz-cell-2').props.accessibilityState).toMatchObject({ checked: false });
    expect(summary()).toBe('1 page chosen');
    expectPrimary('juz-continue', 'Continue');
  });

  it('[ONBOARD-4] a tap chooses a whole juz, a second clears it, and Continue saves those pages', async () => {
    await show(v2(<JuzSelectionScreen />));
    fireEvent.press(screen.getByTestId('juz-cell-30'));
    expect(screen.getByTestId('juz-cell-30').props.accessibilityState).toMatchObject({ checked: true });
    expect(styleOf('juz-cell-30').backgroundColor).toBe(light.primary);
    expect(summary()).toBe('1 juz and 1 page chosen');

    fireEvent.press(screen.getByTestId('juz-cell-2'));
    fireEvent.press(screen.getByTestId('juz-cell-2'));
    expect(screen.getByTestId('juz-cell-2').props.accessibilityState).toMatchObject({ checked: false });

    await act(async () => {
      fireEvent.press(screen.getByTestId('juz-continue'));
    });
    const [updated] = (mockApp.updatePages as jest.Mock).mock.calls[0] as [UserPage[], number[]];
    const saved = updated.filter((p) => p.status === 'memorized').map((p) => p.pageNumber);
    expect(saved).toEqual([1, ...Array.from({ length: 23 }, (_, i) => 582 + i)]);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DailyAmount', { journeyStage: 'in_progress' });
  });

  it('[ONBOARD-4] a partly chosen juz becomes whole on a tap; nothing chosen turns Continue off', async () => {
    await show(v2(<JuzSelectionScreen />));
    fireEvent.press(screen.getByTestId('juz-cell-1'));
    expect(screen.getByTestId('juz-cell-1').props.accessibilityState).toMatchObject({ checked: true });
    fireEvent.press(screen.getByTestId('juz-cell-1'));
    expect(screen.getByTestId('juz-cell-1').props.accessibilityState).toMatchObject({ checked: false });
    expect(summary()).toBe('Nothing chosen yet');
    expect(screen.getByTestId('juz-continue').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('[ONBOARD-4] Choose by surah opens the list on the same selection', async () => {
    await show(v2(<JuzSelectionScreen />));
    expect(screen.queryByTestId('memorization-browser')).toBeNull();
    await act(async () => {
      fireEvent.press(screen.getByTestId('juz-by-surah'));
    });
    expect(screen.getByTestId('memorization-browser')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('mark-juz-2'));
    });
    expect(screen.getByTestId('juz-cell-2').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('[ONBOARD-1] a juz the phone has not loaded yet counts at once, and Continue waits for its pages', async () => {
    // A new account's pages come in batches: Juz 2's (22–41) aren't here yet.
    mockApp.pages = Array.from({ length: 21 }, (_, i) => page(i + 1));
    await show(v2(<JuzSelectionScreen />));
    fireEvent.press(screen.getByTestId('juz-cell-2'));
    expect(screen.getByTestId('juz-cell-2').props.accessibilityState).toMatchObject({ checked: true });
    // Saving now would leave Juz 2 out: Continue waits, and says why.
    expect(screen.getByTestId('juz-continue').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByText('Loading your pages…')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('juz-continue'));
    });
    expect(mockApp.updatePages).not.toHaveBeenCalled();

    mockApp.pages = allPages();
    await act(async () => {
      screen.rerender(v2(<JuzSelectionScreen />));
    });
    expect(screen.getByTestId('juz-continue').props.accessibilityState).toMatchObject({ disabled: false });
    await act(async () => {
      fireEvent.press(screen.getByTestId('juz-continue'));
    });
    const [updated, changed] = (mockApp.updatePages as jest.Mock).mock.calls[0] as [UserPage[], number[]];
    const juz2 = Array.from({ length: 20 }, (_, i) => 22 + i);
    expect([...changed].sort((a, b) => a - b)).toEqual([1, ...juz2]);
    const saved = new Set(updated.filter((p) => p.status === 'memorized').map((p) => p.pageNumber));
    expect(juz2.every((p) => saved.has(p))).toBe(true);
  });

  it('a juz marked before any page has loaded is kept when they arrive', async () => {
    mockApp.pages = [];
    await show(v2(<JuzSelectionScreen />));
    expect(screen.getByTestId('juz-continue').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(screen.getByTestId('juz-cell-2'));
    mockApp.pages = allPages();
    await act(async () => {
      screen.rerender(v2(<JuzSelectionScreen />));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('juz-continue'));
    });
    const [, changed] = (mockApp.updatePages as jest.Mock).mock.calls[0] as [UserPage[], number[]];
    expect([...changed].sort((a, b) => a - b)).toEqual([1, ...Array.from({ length: 20 }, (_, i) => 22 + i)]);
  });

  it('[ONBOARD-4] the line counts what is chosen: a single page mid-surah never shows ayah numbers', async () => {
    mockApp.pages = allPages().map((p) => (p.pageNumber === 5 ? page(5, 'memorized') : p));
    await show(v2(<JuzSelectionScreen />));
    // Part of it clears what was saved and starts from page 1; the list marks a page in Al-Baqarah again.
    await act(async () => {
      fireEvent.press(screen.getByTestId('juz-by-surah'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('mark-page-5'));
    });
    expect(summary()).toBe('2 pages chosen');
    expect(summary()).not.toMatch(/\d+[–-]\d+/);
  });

  it('a cell stays a 44pt target on the narrowest phone, and six fit inside the gutters', () => {
    expect(juzCellSize(320)).toBe(44);
    expect(juzCellSize(320) * 6).toBeLessThanOrEqual(320 - 32);
    expect(juzCellSize(440)).toBe(48);
  });
});

describe('<DailyAmountScreen />', () => {
  it('minus and plus around the number, pages or juz, and how long a round takes', async () => {
    mockRoute.params = { journeyStage: 'in_progress' };
    await show(v2(<DailyAmountScreen />));
    expect(screen.getByLabelText('Step 3 of 5')).toBeTruthy();
    expect(screen.getByTestId('amount-value').props.children).toBe('10');
    expect(screen.getByTestId('amount-unit').props.children).toBe('pages a day');
    // Pages and Juz share the row.
    expect(styleOf('pill-pages').flex).toBe(1);
    expect(styleOf('pill-juz').flex).toBe(1);
    // Two pages memorized at 10 a day.
    expect(screen.getByTestId('amount-round').props.children).toBe('A full round every day');

    fireEvent.press(screen.getByTestId('amount-less'));
    expect(screen.getByTestId('amount-value').props.children).toBe('9');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 8; i++) fireEvent.press(screen.getByTestId('amount-less'));
    expect(screen.getByTestId('amount-value').props.children).toBe('1');
    expect(screen.getByTestId('amount-unit').props.children).toBe('page a day');
    expect(screen.getByTestId('amount-less').props.accessibilityState).toMatchObject({ disabled: true });
    expect(screen.getByTestId('amount-round').props.children).toBe('A full round every 2 days');

    fireEvent.press(screen.getByTestId('pill-juz'));
    expect(screen.getByTestId('amount-value').props.children).toBe('1');
    expect(screen.getByTestId('amount-unit').props.children).toBe('juz a day');
    for (let i = 0; i < 6; i++) fireEvent.press(screen.getByTestId('amount-more'));
    // Five juz a day at most.
    expect(screen.getByTestId('amount-value').props.children).toBe('5');

    fireEvent.press(screen.getByTestId('amount-continue'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('DayStart', {
      journeyStage: 'in_progress',
      scheduleMode: 'juz',
      dailyCapacity: 1,
      dailyJuzCount: 5,
    });
  });

  it('a press held down keeps stepping, and its release adds no extra step', async () => {
    jest.useFakeTimers();
    try {
      mockRoute.params = { journeyStage: 'in_progress' };
      render(v2(<DailyAmountScreen />));
      await act(async () => {
        await jest.advanceTimersByTimeAsync(0);
      });
      fireEvent(screen.getByTestId('amount-more'), 'pressIn');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(380 + 80 * 4);
      });
      expect(screen.getByTestId('amount-value').props.children).toBe('15');
      fireEvent(screen.getByTestId('amount-more'), 'pressOut');
      fireEvent.press(screen.getByTestId('amount-more'));
      expect(screen.getByTestId('amount-value').props.children).toBe('15');
    } finally {
      jest.useRealTimers();
    }
  });

  it('All of it starts at 20 pages', async () => {
    mockRoute.params = { journeyStage: 'complete' };
    await show(v2(<DailyAmountScreen />));
    expect(screen.getByTestId('amount-value').props.children).toBe('20');
  });
});

describe('<DayStartScreen />', () => {
  beforeEach(() => {
    mockRoute.params = answers;
  });

  it('[ONBOARD-3] At Fajr asks for the location and moves on with it', async () => {
    await show(v2(<DayStartScreen />));
    expect(screen.getByLabelText('Step 4 of 5')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('day-fajr'));
    });
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Reminder', {
      ...answers,
      fajrBoundaryEnabled: true,
      locationCoords: { latitude: 21.4, longitude: 39.8 },
    });
  });

  it('location refused: it says so, and the day starts at midnight', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({ status: 'denied' });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    await show(v2(<DayStartScreen />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('day-fajr'));
    });
    expect(alert).toHaveBeenCalledWith('Location not available', expect.any(String));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Reminder', { ...answers, fajrBoundaryEnabled: false, locationCoords: null });
    alert.mockRestore();
  });

  it('At midnight moves on at once and never asks for the location', async () => {
    await show(v2(<DayStartScreen />));
    fireEvent.press(screen.getByTestId('day-midnight'));
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Reminder', { ...answers, fajrBoundaryEnabled: false, locationCoords: null });
  });

  it('Midnight while the location is on its way replaces Fajr', async () => {
    let answer: (v: { status: string }) => void = () => undefined;
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockReturnValueOnce(new Promise((r) => (answer = r)));
    await show(v2(<DayStartScreen />));
    fireEvent.press(screen.getByTestId('day-fajr'));
    fireEvent.press(screen.getByTestId('day-midnight'));
    await act(async () => answer({ status: 'granted' }));
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('Reminder', { ...answers, fajrBoundaryEnabled: false, locationCoords: null });
  });
});

describe('<ReminderScreen />', () => {
  const params = { ...answers, fajrBoundaryEnabled: true, locationCoords: { latitude: 21.4, longitude: 39.8 } };
  beforeEach(() => {
    mockRoute.params = params;
  });

  it('Remind me asks for permission, saves the plan and finishes onboarding', async () => {
    await show(v2(<ReminderScreen />));
    expect(screen.getByLabelText('Step 5 of 5')).toBeTruthy();
    expectPrimary('reminder-on', 'Remind me');
    await act(async () => {
      fireEvent.press(screen.getByTestId('reminder-on'));
    });
    expect(ensureNotificationsPermission).toHaveBeenCalled();
    expect(mockApp.createDefaultUser).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Aisha',
        scheduleMode: 'pages',
        dailyPageCapacity: 10,
        dailyJuzCount: 1,
        notificationsEnabled: true,
        fajrBoundaryEnabled: true,
        locationCoords: { latitude: 21.4, longitude: 39.8 },
      }),
    );
    expect(mockApp.saveUser).toHaveBeenCalled();
    expect(mockApp.completeOnboarding).toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('s');
  });

  it('Not now finishes with reminders off and never prompts', async () => {
    await show(v2(<ReminderScreen />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('reminder-off'));
    });
    expect(ensureNotificationsPermission).not.toHaveBeenCalled();
    expect(mockApp.createDefaultUser).toHaveBeenCalledWith(expect.objectContaining({ notificationsEnabled: false }));
    expect(mockApp.completeOnboarding).toHaveBeenCalled();
  });

  it('declined at the system prompt: reminders are saved off', async () => {
    (ensureNotificationsPermission as jest.Mock).mockResolvedValueOnce(false);
    await show(v2(<ReminderScreen />));
    await act(async () => {
      fireEvent.press(screen.getByTestId('reminder-on'));
    });
    expect(mockApp.createDefaultUser).toHaveBeenCalledWith(expect.objectContaining({ notificationsEnabled: false }));
  });

  it('the card is the real reminder for this plan’s first day', async () => {
    await show(v2(<ReminderScreen />));
    expect(screen.getByTestId('reminder-preview').props.accessibilityLabel).toMatch(/^A sample reminder: Today starts with /);
  });
});
