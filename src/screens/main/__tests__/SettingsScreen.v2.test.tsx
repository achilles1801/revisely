import React from 'react';
import { Alert, AlertButton, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name, color }: { name: string; color: string }) => <Text testID={`icon-${name}`}>{color}</Text> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
// Any glass left in the new design would show up as this.
jest.mock('../../../navigation/TabBar', () => ({ useTabBarFootprint: () => 0 }));
jest.mock('../../../components/settings/AppInfo', () => ({ AppInfo: () => null }));
jest.mock('../../../components/prayer/useChosenAthanVoice', () => ({
  useChosenAthanVoice: () => ({ id: 'makkah-regular', name: 'Makkah – Masjid al-Haram' }),
}));
// The athan is Revisely Dev's, on iPhone (lib/athan `athanEnabled`).
const mockAthan = { enabled: false };
jest.mock('../../../lib/athan', () => ({ athanEnabled: () => mockAthan.enabled }));

const mockNavigation = { goBack: jest.fn(), navigate: jest.fn(), push: jest.fn() };
// The page this render shows (SET-1): none is the first level.
const mockRoute: { params: Record<string, unknown> | undefined } = { params: undefined };
jest.mock('@react-navigation/native', () => {
  const { useEffect } = require('react');
  return {
    useNavigation: () => mockNavigation,
    useRoute: () => mockRoute,
    useFocusEffect: (cb: () => void) => useEffect(cb, [cb]),
  };
});

const mockUser: any = {
  name: 'Majd',
  reminderTime: '08:00',
  notificationsEnabled: true,
  smartTrackingEnabled: false,
  carryOverMode: 'shift',
  fajrBoundaryEnabled: false,
};
const mockSaveUser = jest.fn(async () => undefined);
// The account's pages (none unless a test memorizes some).
let mockPages: { pageNumber: number; status: string }[] = [];
jest.mock('../../../context/AppContext', () => ({
  useApp: () => ({ user: mockUser, pages: mockPages, saveUser: mockSaveUser, resetOnboarding: jest.fn() }),
}));
const mockDeleteAccount = jest.fn(async () => undefined);
jest.mock('../../../context/AuthContext', () => ({
  useAuth: () => ({
    firebaseUser: { uid: 'u1', email: 'majd@example.com' },
    signOutUser: jest.fn(),
    deleteAccount: () => mockDeleteAccount(),
  }),
}));
const mockSubmitFeedback = jest.fn(async () => undefined);
jest.mock('../../../services/firestoreService', () => ({
  getReadingSessions: jest.fn(async () => []),
  submitFeedback: (...a: unknown[]) => mockSubmitFeedback(...(a as [])),
}));
jest.mock('../../../lib/appUsage', () => ({ getTotalAppUsageSeconds: jest.fn(async () => 0) }));
jest.mock('../../../lib/recordings', () => ({ listRecordings: jest.fn(async () => []), deleteAllRecordings: jest.fn() }));
jest.mock('../../../lib/recordingBackupUi', () => ({
  askTurnOffBackup: jest.fn(),
  backupLabel: () => 'Backed up',
  deleteAllEverywhere: jest.fn(),
  useBackupStatus: () => ({}),
}));
jest.mock('../../../lib/sentry', () => ({ reportProblem: jest.fn() }));

// Whether this binary has the microphone module the speech model needs.
let mockFollowable = true;
jest.mock('../../../lib/recite/micSource', () => ({ isMicStreamAvailable: () => mockFollowable }));
let mockModelState: Record<string, unknown> = { status: 'missing', error: null };
const mockRemoveModel = jest.fn();
jest.mock('../../../lib/recite/speechModelStore', () => ({
  useSpeechModelState: () => mockModelState,
  removeSpeechModel: () => mockRemoveModel(),
  startModelDownload: jest.fn(),
  cancelModelDownload: jest.fn(),
}));
jest.mock('@react-native-community/netinfo', () => ({ fetch: jest.fn(async () => ({ type: 'wifi' })) }));
// Revisely Dev or the store app (lib/variant); the store app unless a test says otherwise.
let mockDev = false;
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => mockDev }));
// The checker's model row asks the checker over the network: its own test covers it (CheckerModelRow.test).
jest.mock('../../../components/settings/CheckerModelRow', () => ({
  CheckerModelRow: () => {
    const { Text } = require('react-native');
    return <Text testID="settings-checker-model">Mistake detection model</Text>;
  },
}));

// The language picker (src/i18n/choice): Revisely Dev only. Tests run in English, so the real one never offers it.
const mockChooseLanguage = jest.fn(async (_choice: string) => 'ar');
const mockRestartForLanguage = jest.fn(async () => undefined);
jest.mock('../../../i18n/choice', () => ({
  ...jest.requireActual('../../../i18n/choice'),
  languagePickerOffered: () => mockDev,
  offeredLanguages: () => ['en', 'ar'],
  chooseLanguage: (choice: string) => mockChooseLanguage(choice),
  restartForLanguage: () => mockRestartForLanguage(),
}));

import SettingsScreen from '../SettingsScreen';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { DEFAULT_ACCENT, paletteV2 } from '../../../theme/v2';

const palette = paletteV2(false, DEFAULT_ACCENT);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flat = (style: unknown): Record<string, any> => StyleSheet.flatten(style as never) ?? {};

/** Settings at `page` (SET-1), or its first level. */
async function renderV2(page?: string, params?: Record<string, unknown>) {
  mockRoute.params = params ?? (page ? { page } : undefined);
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('Settings in the new design: its sheets and rows', () => {
  it('has no glass anywhere; Smart Tracking says what it does under its label; the version line is metadata', async () => {
    await renderV2();
    expect(flat(screen.getByText(/^Revisely · v/).props.style).color).toBe(palette.secondary);
    await renderV2('revision');
    expect(screen.getByTestId('smart-tracking-row')).toBeTruthy();
    expect(screen.getByText(/Turn on to rate pages/).props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: palette.secondary })]),
    );
  });

  it('Reminders: the Revision reminders switch, no Reminder time row or sheet', async () => {
    await renderV2('reminders');
    expect(screen.getByText('Revision reminders')).toBeTruthy();
    expect(screen.queryByText('Reminder time')).toBeNull();
    expect(screen.queryByLabelText(/Reminder time/)).toBeNull();
    expect(screen.queryByTestId('time-sheet')).toBeNull();
  });

  it('display name: a field on the quiet fill, saved from the header', async () => {
    await renderV2('account');
    fireEvent.press(screen.getByLabelText('Display name, Majd'));
    await act(async () => {});
    const input = screen.getByTestId('name-sheet-input');
    expect(flat(input.props.style)).toMatchObject({ backgroundColor: palette.fill, color: palette.text });
    expect(input.props.placeholderTextColor).toBe(palette.secondary);
    fireEvent.changeText(input, '  Omar ');
    await act(async () => {
      fireEvent.press(screen.getByTestId('name-sheet-save'));
    });
    expect(mockSaveUser).toHaveBeenCalledWith(expect.objectContaining({ name: 'Omar' }));
  });

  it('feedback: Submit stays off until something is written, then sends it', async () => {
    await renderV2('help');
    fireEvent.press(screen.getByLabelText('Send feedback'));
    await act(async () => {});
    expect(screen.getByTestId('feedback-sheet-save').props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.changeText(screen.getByTestId('feedback-sheet-input'), 'The timer is great');
    expect(screen.getByTestId('feedback-sheet-save').props.accessibilityState).toMatchObject({ disabled: false });
    jest.spyOn(require('react-native').Alert, 'alert').mockImplementation(() => undefined);
    await act(async () => {
      fireEvent.press(screen.getByTestId('feedback-sheet-save'));
    });
    expect(mockSubmitFeedback).toHaveBeenCalledWith(expect.objectContaining({ message: 'The timer is great' }));
  });
});

describe('Settings: no progress card setting (Home always shows how much is memorized)', () => {
  it('no Progress card, no Shows, no Progress style; the Al-Kahf card is in Reminders', async () => {
    for (const page of [undefined, 'appearance', 'reminders']) {
      await renderV2(page);
      for (const gone of ['Progress card', 'Shows', 'Juz memorized', 'Pages memorized', 'Surahs memorized', 'Progress style']) {
        expect(screen.queryByText(gone)).toBeNull();
      }
      expect(screen.queryByTestId('progress-style-row')).toBeNull();
    }
    expect(screen.getByText('Friday Al-Kahf reminder')).toBeTruthy();
    expect(screen.getByText('A card on Home on Fridays')).toBeTruthy();
  });
});

describe('Settings: Appearance and haptics (Oct 28)', () => {
  it('Accent is a row like Theme: the label on the left, the three choices on its right', async () => {
    await renderV2('appearance');
    const row = screen.getByTestId('accent-row');
    expect(flat(row.props.style).flexDirection).toBe('row');
    // The picker sits in the row itself, after the label, pushed to the right.
    const picker = screen.getByTestId('accent-picker');
    expect(flat(picker.props.style)).toMatchObject({ flexDirection: 'row', justifyContent: 'flex-end' });
    let parent = picker.parent;
    while (parent && parent.props.testID !== 'accent-row') parent = parent.parent;
    expect(parent).toBeTruthy();
    // The same pill size as Theme's Light and Dark.
    expect(flat(screen.getByTestId('accent-indigo').props.style).minHeight).toBe(30);
    expect(screen.getByLabelText('Indigo').props.accessibilityState).toMatchObject({ checked: true });
  });

  it('no Haptics switch: haptics are always on for the moments that matter', async () => {
    await renderV2('appearance');
    expect(screen.queryByText('Haptics')).toBeNull();
    expect(screen.queryByLabelText('Haptics')).toBeNull();
  });
});

describe('Settings: Language (Revisely Dev until Arabic ships)', () => {
  afterEach(() => {
    mockDev = false;
  });

  it('the store app: no Language row', async () => {
    await renderV2('appearance');
    expect(screen.queryByTestId('settings-language')).toBeNull();
  });

  it("Revisely Dev: the row follows the phone until a language is picked; picking Arabic keeps it and offers a restart", async () => {
    mockDev = true;
    await renderV2('appearance');
    const row = screen.getByTestId('settings-language');
    expect(within(row).getByText('Phone’s language')).toBeTruthy();
    fireEvent.press(row);
    await act(async () => {});
    const sheet = screen.getByTestId('language-sheet');
    expect(within(sheet).getByText('English')).toBeTruthy();
    expect(within(sheet).getByText('Now English')).toBeTruthy();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent.press(within(sheet).getByText('العربية'));
    await act(async () => {
      screen.UNSAFE_getAllByType(require('react-native').Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
    });
    expect(mockChooseLanguage).toHaveBeenCalledWith('ar');
    expect(within(screen.getByTestId('settings-language')).getByText('العربية')).toBeTruthy();
    expect(alert).toHaveBeenCalledWith('Restart Revisely?', 'It closes and opens again in العربية.', expect.any(Array));
    const buttons = alert.mock.calls[0][2] as AlertButton[];
    expect(buttons.map((b) => b.text)).toEqual(['Not now', 'Restart']);
    buttons[1].onPress?.();
    expect(mockRestartForLanguage).toHaveBeenCalled();
    alert.mockRestore();
  });
});

describe('Settings: Prayer (every account from 1.0.3)', () => {
  afterEach(() => {
    delete mockUser.previewTester;
  });

  it('not a tester: Prayer is there too (public), and no Day boundary anywhere', async () => {
    await renderV2();
    expect(screen.getByTestId('settings-page-prayer')).toBeTruthy();
    expect(screen.queryByText('Day boundary')).toBeNull();
    await renderV2('reminders');
    expect(screen.getByText('Prayer notifications')).toBeTruthy();
    await renderV2('prayer');
    expect(screen.getByText('Next prayer on Home')).toBeTruthy();
  });

  it('Prayer holds times, calculation, the Qibla and Next prayer on Home; Start day at fajr is in Revision, Prayer notifications in Reminders', async () => {
    mockUser.fajrCalculationMethod = 'MoonsightingCommittee';
    await renderV2('prayer');
    for (const label of ['Prayer times', 'Calculation', 'Qibla', 'Next prayer on Home']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByText('Start day at fajr')).toBeNull();
    expect(screen.getByText('Moonsighting')).toBeTruthy();
    fireEvent.press(screen.getByText('Calculation'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PrayerCalculation');
    // No athan in the store app (or on Android).
    expect(screen.queryByText('Athan voice')).toBeNull();
    await renderV2('revision');
    expect(screen.getByText('Start day at fajr')).toBeTruthy();
    // With prayer times the method is under Calculation, not under the fajr switch.
    expect(screen.queryByTestId('fajr-method')).toBeNull();
    await renderV2('reminders');
    fireEvent.press(screen.getByText('Prayer notifications'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('PrayerNotifications');
  });

  it('Revisely Dev on iPhone: the athan voice, by name, opens its picker', async () => {
    mockAthan.enabled = true;
    try {
      await renderV2('prayer');
      expect(screen.getByText('Makkah – Masjid al-Haram')).toBeTruthy();
      fireEvent.press(screen.getByText('Athan voice'));
      expect(mockNavigation.navigate).toHaveBeenCalledWith('AthanVoice');
    } finally {
      mockAthan.enabled = false;
    }
  });
});

describe('Settings: the speech model', () => {
  beforeEach(() => {
    mockFollowable = true;
    mockModelState = { status: 'missing', error: null };
  });
  afterEach(() => {
    delete mockUser.previewTester;
  });

  it('a binary without the module: no row, tester or not', async () => {
    mockFollowable = false;
    await renderV2('storage');
    expect(screen.queryByText('Speech model')).toBeNull();
    mockUser.previewTester = true;
    await renderV2('storage');
    expect(screen.queryByText('Speech model')).toBeNull();
  });

  it('[SEARCH-1] any account: the row is for searching by voice, and its download says so', async () => {
    await renderV2('storage');
    expect(screen.getByText('Speech model')).toBeTruthy();
    expect(screen.getByText('Searches the Quran by voice, on this iPhone')).toBeTruthy();
    expect(screen.getByText('Not downloaded')).toBeTruthy();
    fireEvent.press(screen.getByText('Speech model'));
    await act(async () => {});
    expect(screen.getByTestId('speech-model-sheet')).toHaveTextContent('Search by voice', { exact: false });
    expect(screen.getByTestId('speech-model-sheet')).toHaveTextContent('Recite a few words and Revisely finds the ayah.', { exact: false });
  });

  it('a tester too: voice search alone (the old hidden page that followed the recitation is gone, Nov 17 2026)', async () => {
    mockUser.previewTester = true;
    await renderV2('storage');
    expect(screen.getByText('Searches the Quran by voice, on this iPhone')).toBeTruthy();
    fireEvent.press(screen.getByText('Speech model'));
    await act(async () => {});
    expect(screen.getByTestId('speech-model-sheet')).toHaveTextContent('Search by voice', { exact: false });
  });

  it('on the phone: its size, and Delete', async () => {
    mockModelState = { status: 'ready', bytes: 59_707_625 };
    await renderV2('storage');
    expect(screen.getByText('57 MB')).toBeTruthy();
    fireEvent.press(screen.getByText('Speech model'));
    await act(async () => {});
    expect(screen.getByTestId('speech-model-delete-menu')).toHaveTextContent(
      '57 MB on this iPhone. It downloads again the next time you search by voice.',
      { exact: false },
    );
    fireEvent.press(screen.getByTestId('sheet-action-delete'));
    await act(async () => {
      screen.UNSAFE_getAllByType(require('react-native').Modal).forEach((m: { props: { onDismiss?: () => void } }) => m.props.onDismiss?.());
    });
    expect(mockRemoveModel).toHaveBeenCalled();
  });

  it('downloading: the progress', async () => {
    mockUser.previewTester = true;
    mockModelState = { status: 'downloading', progress: 0.3 };
    await renderV2('storage');
    expect(screen.getByText('30%')).toBeTruthy();
  });
});

describe('Settings: Reset my data (testers)', () => {
  afterEach(() => {
    delete mockUser.previewTester;
  });

  it('not a previewTester account: no Testing page, no row', async () => {
    await renderV2();
    expect(screen.queryByTestId('settings-page-testing')).toBeNull();
    await renderV2('testing');
    expect(screen.queryByTestId('reset-data-row')).toBeNull();
    expect(screen.queryByText('Reset my data')).toBeNull();
  });

  it('a previewTester account: the row, in red, says what it does and opens the RESET sheet', async () => {
    mockUser.previewTester = true;
    await renderV2();
    fireEvent.press(screen.getByTestId('settings-page-testing'));
    expect(mockNavigation.push).toHaveBeenCalledWith('Settings', { page: 'testing' });
    await renderV2('testing');
    const label = screen.getByText('Reset my data');
    expect(flat(label.props.style).color).toBe(palette.red);
    expect(screen.getByText('Start again as a new account')).toBeTruthy();
    await act(async () => {
      fireEvent.press(label);
    });
    expect(screen.getByTestId('reset-data-input')).toBeTruthy();
    expect(screen.getByTestId('reset-data-confirm').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe("Settings: the checker's model (Revisely Dev's testers)", () => {
  afterEach(() => {
    mockDev = false;
    delete mockUser.previewTester;
  });

  it('Revisely Dev, a tester: the row is in Testing', async () => {
    mockDev = true;
    mockUser.previewTester = true;
    await renderV2('testing');
    expect(screen.getByTestId('settings-checker-model')).toBeTruthy();
  });

  it('the store app, tester or not: no row', async () => {
    mockUser.previewTester = true;
    await renderV2('testing');
    expect(screen.queryByTestId('settings-checker-model')).toBeNull();
    delete mockUser.previewTester;
    await renderV2('testing');
    expect(screen.queryByTestId('settings-checker-model')).toBeNull();
  });
});

describe('[RECITE-8] Spot tests: their choices on Mushaf and Recite', () => {
  afterEach(() => {
    mockDev = false;
    mockPages = [];
  });

  it('how far (1 page at first), where from (everything, or a memorized juz) and Show progress (on at first)', async () => {
    mockDev = true;
    mockPages = Array.from({ length: 20 }, (_, i) => ({ pageNumber: 582 + i, status: 'memorized' }));
    await renderV2('mushaf');
    expect(screen.getByText('Spot tests')).toBeTruthy();
    expect(screen.getByLabelText('1, selected')).toBeTruthy();
    expect(screen.getByTestId('settings-test-where').props.accessibilityLabel).toBe('Where from, Everything you’ve memorized');
    expect(screen.getByTestId('settings-test-progress').props.value).toBe(true);
    fireEvent.press(screen.getByTestId('settings-test-where'));
    await act(async () => {});
    expect(screen.getByText('Juz 30')).toBeTruthy();
  });
});

describe('[RECITE-26] Keep my recitations as test data: Revisely Dev, every account that recites', () => {
  afterEach(() => {
    mockDev = false;
    delete mockUser.previewTester;
  });

  it('Revisely Dev, not a tester: on Mushaf and Recite (on until turned off), and no Testing page', async () => {
    mockDev = true;
    await renderV2('mushaf');
    expect(screen.getByText('Keep my recitations as test data')).toBeTruthy();
    expect(screen.getByTestId('settings-recite-check-keep').props.value).toBe(true);
    await renderV2();
    expect(screen.queryByTestId('settings-page-testing')).toBeNull();
  });

  it('Revisely Dev, a tester: the same row on Mushaf and Recite, none on Testing', async () => {
    mockDev = true;
    mockUser.previewTester = true;
    await renderV2('mushaf');
    expect(screen.getByTestId('settings-recite-check-keep')).toBeTruthy();
    await renderV2('testing');
    expect(screen.queryByTestId('settings-recite-check-keep')).toBeNull();
  });

  it('the store app, tester or not: never (production’s checker keeps nothing)', async () => {
    await renderV2('mushaf');
    expect(screen.queryByTestId('settings-recite-check-keep')).toBeNull();
    mockUser.previewTester = true;
    await renderV2('testing');
    expect(screen.queryByTestId('settings-recite-check-keep')).toBeNull();
  });
});

describe('Settings: Load test scenario (testers)', () => {
  afterEach(() => {
    delete mockUser.previewTester;
    jest.requireActual('../../../lib/offline/sync').releaseSync('u1');
  });

  it('changes held by the Offline queue scenario: a row sends them', async () => {
    mockUser.previewTester = true;
    const sync = jest.requireActual('../../../lib/offline/sync');
    sync.holdSync('u1');
    await renderV2('testing');
    expect(screen.getByTestId('held-changes-row')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByText('Send held changes'));
    });
    expect(sync.isSyncHeld('u1')).toBe(false);
    expect(screen.queryByTestId('held-changes-row')).toBeNull();
  });

  it('not a previewTester account: no row', async () => {
    await renderV2('testing');
    expect(screen.queryByTestId('test-scenario-row')).toBeNull();
    expect(screen.queryByText('Load test scenario')).toBeNull();
  });

  it('a previewTester account: the row, in red, opens the scenario sheet', async () => {
    mockUser.previewTester = true;
    await renderV2('testing');
    const label = screen.getByText('Load test scenario');
    expect(flat(label.props.style).color).toBe(palette.red);
    await act(async () => {
      fireEvent.press(label);
    });
    expect(screen.getByTestId('test-scenario-heavy')).toBeTruthy();
    expect(screen.getByTestId('test-scenario-confirm').props.accessibilityState).toMatchObject({ disabled: true });
  });
});

describe('[ACCOUNT-3] Delete account', () => {
  /** The buttons of the last alert with this title. */
  const alertButtons = (alert: jest.SpyInstance, title: string): AlertButton[] => {
    const call = [...alert.mock.calls].reverse().find((c) => c[0] === title);
    if (!call) throw new Error(`no "${title}" alert`);
    return call[2] ?? [];
  };
  const press = async (alert: jest.SpyInstance, title: string, button: string) => {
    const b = alertButtons(alert, title).find((x) => x.text === button);
    if (!b?.onPress) throw new Error(`no "${button}" on "${title}"`);
    await act(async () => {
      b.onPress!();
    });
  };

  it('confirmed twice, it deletes; a failure says why and offers Try again, which deletes', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockDeleteAccount.mockRejectedValueOnce(
      Object.assign(new Error("The server didn't answer in time, so your account may not be deleted. Check your connection and try again."), {
        code: 'deadline-exceeded',
      }),
    );
    await renderV2('account');
    fireEvent.press(screen.getByText('Delete account'));
    await press(alert, 'Delete account?', 'Delete');
    await press(alert, 'Are you absolutely sure?', 'I understand, delete');
    expect(mockDeleteAccount).toHaveBeenCalledTimes(1);

    const failed = alert.mock.calls.find((c) => c[0] === 'Could not delete account');
    expect(failed?.[1]).toMatch(/didn't answer in time/);
    expect(alertButtons(alert, 'Could not delete account').map((b) => b.text)).toEqual(['Cancel', 'Try again']);
    await press(alert, 'Could not delete account', 'Try again');
    expect(mockDeleteAccount).toHaveBeenCalledTimes(2);
    expect(alert).toHaveBeenLastCalledWith('Account deleted', 'Your account and data have been removed.');
    alert.mockRestore();
  });
});

describe('[SET-1] Settings: a short first level, a page per group', () => {
  afterEach(() => {
    mockDev = false;
  });

  it('the first level: your account, then each page with what it is set to; a row opens its page', async () => {
    await renderV2();
    expect(screen.getByLabelText('Majd, majd@example.com. Your account')).toBeTruthy();
    const value = (id: string, label: string) => {
      const row = screen.getByTestId(id);
      expect(row.props.accessibilityLabel.startsWith(label)).toBe(true);
      return row.props.accessibilityLabel.slice(label.length).replace(/^, /, '');
    };
    expect(value('settings-page-revision', 'Revision')).toBe('Smart Tracking off');
    expect(value('settings-page-reminders', 'Reminders')).toMatch(/^On/);
    expect(value('settings-page-mushaf', 'Mushaf and Recite')).toBe('Madani 1405');
    expect(value('settings-page-appearance', 'Appearance')).toBe('Light · Indigo');
    for (const id of ['settings-page-prayer', 'settings-page-storage', 'settings-page-help', 'settings-page-about']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    // Nothing of a page's own rows on the first level.
    for (const gone of ['smart-tracking-switch', 'settings-notifications', 'accent-row', 'settings-delete-account', 'settings-sign-out']) {
      expect(screen.queryByTestId(gone)).toBeNull();
    }
    fireEvent.press(screen.getByTestId('settings-page-storage'));
    expect(mockNavigation.push).toHaveBeenCalledWith('Settings', { page: 'storage' });
    fireEvent.press(screen.getByTestId('settings-account'));
    expect(mockNavigation.push).toHaveBeenCalledWith('Settings', { page: 'account' });
  });

  it('a page has its own title and only its rows; Downloads and storage holds the mushaf, the recordings and the speech model', async () => {
    await renderV2('storage');
    expect(screen.getByText('Downloads and storage')).toBeTruthy();
    for (const label of ['Offline mushaf', 'Download over mobile data', 'Recordings', 'Back up recordings', 'Back up over mobile data', 'Speech model']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.queryByTestId('settings-page-revision')).toBeNull();
    expect(screen.queryByText(/^Revisely · v/)).toBeNull();
  });

  it('the Account page: your name, Display name, Time in app, then Sign out and Delete account', async () => {
    await renderV2('account');
    expect(screen.getByTestId('settings-account-header')).toBeTruthy();
    expect(screen.getByLabelText('Display name, Majd')).toBeTruthy();
    expect(screen.getByText('Time in app')).toBeTruthy();
    expect(screen.getByTestId('settings-sign-out')).toBeTruthy();
    expect(screen.getByTestId('settings-delete-account')).toBeTruthy();
  });

  it("a Settings section (Revo's openScreen, Insights' Turn on Smart Tracking) opens the page that holds it", async () => {
    await renderV2(undefined, { section: 'notifications' });
    expect(screen.getByText('Reminders')).toBeTruthy();
    expect(screen.getByTestId('settings-notifications')).toBeTruthy();
    await renderV2(undefined, { section: 'revision' });
    expect(screen.getByTestId('smart-tracking-switch')).toBeTruthy();
    await renderV2(undefined, { section: 'activity' });
    expect(screen.getByText('Back up recordings')).toBeTruthy();
  });
});
