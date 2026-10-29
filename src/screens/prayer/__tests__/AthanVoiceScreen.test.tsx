import React from 'react';
import { Linking, Modal } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's' },
}));
const mockNavigation = { goBack: jest.fn(), navigate: jest.fn() };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNavigation }));

const mockPlayer = { replace: jest.fn(), play: jest.fn(), pause: jest.fn(), remove: jest.fn(), addListener: jest.fn() };
jest.mock('expo-audio', () => ({
  createAudioPlayer: jest.fn(() => mockPlayer),
  setAudioModeAsync: jest.fn(async () => undefined),
  setIsAudioActiveAsync: jest.fn(async () => undefined),
}));

// The athan store (network, files) is the release session's (lib/athan); here its API.
let mockVoices: unknown[] = [];
let mockStates: Record<string, unknown> = {};
let mockCatalogError: string | null = null;
const mockDownload = jest.fn(async (_id: string) => true);
const mockDelete = jest.fn();
const mockCancel = jest.fn();
jest.mock('../../../lib/athan', () => ({
  ...jest.requireActual('../../../lib/athan/catalog'),
  ATHAN_DOWNLOADS_SUPPORTED: true,
  useAthanCatalog: () => ({ voices: mockVoices, loading: false, error: mockCatalogError, refresh: jest.fn() }),
  useAthanVoiceState: (id: string) =>
    mockStates[id] ?? (id === 'icr-asim-javed' ? { status: 'bundled' } : { status: 'missing', error: null }),
  downloadAthanVoice: (id: string) => mockDownload(id),
  deleteAthanVoice: (id: string) => mockDelete(id),
  cancelAthanDownload: (id: string) => mockCancel(id),
}));

import AthanVoiceScreen, { rightsIssueUrl } from '../AthanVoiceScreen';
import { BUNDLED_ATHAN_VOICE, type AthanVoice } from '../../../lib/athan/catalog';
import { DEFAULT_PRAYER_PREFS, getPrayerPrefs, resetPrayerPrefsForTests } from '../../../lib/prayer/prefs';
import { claimAudio } from '../../../lib/audioFocus';

const voice = (id: string, style: string, opts: Partial<AthanVoice> = {}): AthanVoice => ({
  id,
  name: id,
  style,
  fajr: false,
  provenance: 'clear',
  credit: `${id} credit`,
  licence: 'Public Domain Mark 1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/mark/1.0/',
  sourceUrl: `https://archive.org/details/${id}`,
  clip: { url: `https://revisely.app/athan/notif/${id}.caf`, seconds: 29, bytes: 346_000 },
  full: null,
  previewUrl: `https://revisely.app/athan/notif/${id}.m4a`,
  bundled: false,
  ...opts,
});

const VOICES = [
  BUNDLED_ATHAN_VOICE,
  voice('tr-gocek-fajr', 'turkish', { name: 'Göcek, Turkey (Fajr)', fajr: true, clip: null }),
  voice('makkah-regular', 'makkah', { name: 'Makkah – Masjid al-Haram', provenance: 'unclear', credit: 'Recorded at Masjid al-Haram' }),
  voice('makkah-fajr', 'makkah', { name: 'Makkah – Masjid al-Haram (Fajr)', fajr: true, provenance: 'unclear' }),
  voice('madinah-fajr', 'madinah', { name: 'Madinah (Fajr)', fajr: true, clip: null, provenance: 'unclear' }),
  voice('aqsa-maghrib', 'aqsa', { name: 'Al-Aqsa (Maghrib)', provenance: 'unclear' }),
];

// A menu's action runs once its modal has gone (iOS: the modal's dismissal).
const dismissMenus = () => screen.UNSAFE_getAllByType(Modal).forEach((m) => m.props.onDismiss?.());
const checked = (id: string) => screen.getByTestId(`athan-choose-${id}`).props.accessibilityState?.checked;

beforeEach(() => {
  jest.clearAllMocks();
  mockVoices = VOICES;
  mockStates = {};
  mockCatalogError = null;
  resetPrayerPrefsForTests({ ...DEFAULT_PRAYER_PREFS });
});

describe('Athan voice', () => {
  it('lists the voices a prayer can play, the built-in one chosen; a Fajr athan goes with its voice; the rest to listen to', () => {
    render(<AthanVoiceScreen />);
    expect(checked('icr-asim-javed')).toBe(true);
    expect(checked('makkah-regular')).toBe(false);
    expect(within(screen.getByTestId('athan-voice-icr-asim-javed')).getByText('Built in')).toBeTruthy();
    const makkah = screen.getByTestId('athan-voice-makkah-regular');
    expect(within(makkah).getByText('Downloads when chosen · 338 KB · With its Fajr athan')).toBeTruthy();
    // The credit is shown (unclear provenance needs it).
    expect(within(makkah).getByText('Recorded at Masjid al-Haram')).toBeTruthy();
    // Makkah's Fajr athan isn't a choice of its own; listen-only voices can't be chosen.
    expect(screen.queryByTestId('athan-voice-makkah-fajr')).toBeNull();
    expect(screen.getByTestId('athan-voice-madinah-fajr')).toBeTruthy();
    expect(screen.queryByTestId('athan-choose-madinah-fajr')).toBeNull();
    expect(within(screen.getByTestId('athan-voice-tr-gocek-fajr')).getByText('Fajr athan · listen only')).toBeTruthy();
  });

  it('one tap chooses a voice for every prayer, Fajr its Fajr athan, and downloads them', async () => {
    resetPrayerPrefsForTests({
      ...DEFAULT_PRAYER_PREFS,
      alerts: { ...DEFAULT_PRAYER_PREFS.alerts, asr: { on: true, before: 10, sound: 'athan', voice: null } },
    });
    render(<AthanVoiceScreen />);
    await act(async () => fireEvent.press(screen.getByTestId('athan-choose-makkah-regular')));
    const alerts = getPrayerPrefs().alerts;
    expect(alerts.fajr.voice).toBe('makkah-fajr');
    expect(alerts.dhuhr.voice).toBe('makkah-regular');
    expect(alerts.asr).toEqual({ on: true, before: 10, sound: 'athan', voice: 'makkah-regular' });
    expect(mockDownload.mock.calls.map(([id]) => id).sort()).toEqual(['makkah-fajr', 'makkah-regular']);
    expect(checked('makkah-regular')).toBe(true);
    expect(checked('icr-asim-javed')).toBe(false);
    // Back to the built-in voice: nothing to download.
    mockDownload.mockClear();
    await act(async () => fireEvent.press(screen.getByTestId('athan-choose-icr-asim-javed')));
    expect(Object.values(getPrayerPrefs().alerts).map((a) => a.voice)).toEqual([null, null, null, null, null]);
    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('listening: plays the preview, a second tap stops it; something else taking the audio stops it too', () => {
    render(<AthanVoiceScreen />);
    fireEvent.press(screen.getByTestId('athan-preview-madinah-fajr'));
    expect(mockPlayer.replace).toHaveBeenCalledWith({ uri: 'https://revisely.app/athan/notif/madinah-fajr.m4a' });
    expect(mockPlayer.play).toHaveBeenCalled();
    expect(screen.getByLabelText('Stop Madinah (Fajr)')).toBeTruthy();
    fireEvent.press(screen.getByTestId('athan-preview-madinah-fajr'));
    expect(mockPlayer.pause).toHaveBeenCalled();
    expect(screen.getByLabelText('Listen to Madinah (Fajr)')).toBeTruthy();
    fireEvent.press(screen.getByTestId('athan-preview-aqsa-maghrib'));
    act(() => claimAudio('recitation', 'someone-else'));
    expect(screen.getByLabelText('Listen to Al-Aqsa (Maghrib)')).toBeTruthy();
  });

  it('a voice’s menu: its licence, where it’s from, and "Report a rights issue"', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    render(<AthanVoiceScreen />);
    fireEvent.press(screen.getByTestId('athan-menu-makkah-regular'));
    expect(screen.getByTestId('athan-voice-menu')).toBeTruthy();
    fireEvent.press(screen.getByText('Licence: Public Domain Mark 1.0'));
    dismissMenus();
    expect(open).toHaveBeenLastCalledWith('https://creativecommons.org/publicdomain/mark/1.0/');
    fireEvent.press(screen.getByTestId('athan-menu-makkah-regular'));
    fireEvent.press(screen.getByText('Where it’s from'));
    dismissMenus();
    expect(open).toHaveBeenLastCalledWith('https://archive.org/details/makkah-regular');
    fireEvent.press(screen.getByTestId('athan-menu-makkah-regular'));
    fireEvent.press(screen.getByText('Report a rights issue'));
    dismissMenus();
    expect(open).toHaveBeenLastCalledWith(rightsIssueUrl(VOICES[2]));
    expect(rightsIssueUrl(VOICES[2])).toMatch(/^mailto:support@revisely\.app\?subject=Athan%20voice%20rights%20issue%3A%20Makkah/);
    // Not downloaded: nothing to remove.
    fireEvent.press(screen.getByTestId('athan-menu-makkah-regular'));
    expect(screen.queryByText('Remove download')).toBeNull();
    open.mockRestore();
  });

  it('a downloaded voice can be removed; one downloading shows its progress and can be stopped; a failure says why', () => {
    mockStates = {
      'makkah-regular': { status: 'ready' },
      'aqsa-maghrib': { status: 'downloading', progress: 0.42 },
    };
    render(<AthanVoiceScreen />);
    expect(within(screen.getByTestId('athan-voice-makkah-regular')).getByText('Downloaded · With its Fajr athan')).toBeTruthy();
    expect(within(screen.getByTestId('athan-voice-aqsa-maghrib')).getByText('Downloading 42%')).toBeTruthy();
    fireEvent.press(screen.getByTestId('athan-menu-makkah-regular'));
    fireEvent.press(screen.getByText('Remove download'));
    dismissMenus();
    expect(mockDelete).toHaveBeenCalledWith('makkah-regular');
    fireEvent.press(screen.getByTestId('athan-menu-aqsa-maghrib'));
    fireEvent.press(screen.getByText('Stop downloading'));
    dismissMenus();
    expect(mockCancel).toHaveBeenCalledWith('aqsa-maghrib');
  });

  it('a failed download says why; a catalog that couldn’t be read says so and keeps the list', () => {
    mockStates = { 'aqsa-maghrib': { status: 'missing', error: 'The download stopped. Try again.' } };
    mockCatalogError = 'Couldn’t load the voices. Showing the last list.';
    render(<AthanVoiceScreen />);
    expect(within(screen.getByTestId('athan-voice-aqsa-maghrib')).getByText('The download stopped. Try again.')).toBeTruthy();
    expect(screen.getByTestId('athan-catalog-status')).toHaveTextContent('Couldn’t load the voices. Showing the last list.');
    expect(screen.getByTestId('athan-choose-makkah-regular')).toBeTruthy();
  });
});
