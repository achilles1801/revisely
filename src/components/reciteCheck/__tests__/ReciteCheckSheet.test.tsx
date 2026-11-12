import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/ThemeContext', () => {
  const { paletteLight, v2ThemeColors } = require('../../../theme/v2');
  return { useTheme: () => ({ theme: v2ThemeColors(false), isDark: false, palette: paletteLight }) };
});
jest.mock('../../../lib/logger', () => ({ logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
let mockHandlers: { onAudio: (s: Int16Array) => void; onStop: (r: string) => void } | null = null;
const mockStopMic = jest.fn(async () => undefined);
jest.mock('../../../lib/recite/micSource', () => ({
  isMicStreamAvailable: () => true,
  startMicStream: jest.fn(async (h: never) => {
    mockHandlers = h;
    return { stop: mockStopMic };
  }),
}));
jest.mock('../../../lib/recite/quranWords', () => {
  const actual = jest.requireActual('../../../lib/recite/quranWords');
  const fixture = () => require('../../../lib/recite/__fixtures__/quranWords').quranWords();
  return { ...actual, loadQuranWords: async () => fixture(), getQuranWords: () => null };
});
jest.mock('expo-audio', () => ({
  getRecordingPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: false })),
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: false })),
  setAudioModeAsync: jest.fn(async () => undefined),
  setIsAudioActiveAsync: jest.fn(async () => undefined),
}));
jest.mock('../../../lib/recitation', () => ({ getRecitation: () => ({ stop: jest.fn() }) }));
const mockCheck = jest.fn();
jest.mock('../../../lib/reciteCheck/service', () => {
  const actual = jest.requireActual('../../../lib/reciteCheck/service');
  return { ...actual, checkRecitation: (...a: unknown[]) => mockCheck(...a), warmUpReciteCheck: jest.fn() };
});

import { ReciteCheckSheet } from '../ReciteCheckSheet';
import { resetReciteCheckSettingsForTests, setReciteCheckSettings } from '../../../lib/reciteCheck/settings';
import { CheckError } from '../../../lib/reciteCheck/service';

const flush = () => act(async () => {});
const second = () => new Int16Array(16000).fill(500);

// Al-Fatiha with its fourth ayah (words 10–12) skipped, and Ad-Dallin's madd short against a setting of 4.
const answer = {
  v: 1,
  from: 0,
  to: 29,
  secs: 40,
  words: [
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((w) => ({ w, status: 'correct' })),
    ...[10, 11, 12].map((w) => ({ w, status: 'missed', kind: 'skipped' })),
    ...Array.from({ length: 16 }, (_, i) => ({ w: 13 + i, status: 'correct' })),
  ],
  extras: [],
  tajweed: [{ w: 28, rule: 'madd_aared', got: 2.4, expected: 4 }],
  letters: null,
  kept: true,
};

async function open() {
  const onClose = jest.fn();
  render(<ReciteCheckSheet visible from={{ sura: 1, ayah: 1 }} accountId="u1" onClose={onClose} />);
  await flush();
  return onClose;
}

async function recite(seconds: number) {
  fireEvent.press(screen.getByTestId('recite-check-start'));
  await flush();
  for (let i = 0; i < seconds; i++) {
    await act(async () => {
      mockHandlers!.onAudio(second());
    });
  }
  fireEvent.press(screen.getByTestId('recite-check-stop'));
  await flush();
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  resetReciteCheckSettingsForTests();
  mockCheck.mockResolvedValue(require('../../../lib/reciteCheck/result').parseCheckResult(answer));
});

describe('<ReciteCheckSheet />', () => {
  it('shows the AI notice in English and Arabic before the first check, then not again', async () => {
    await open();
    expect(screen.getByText(/artificial-intelligence model that may make mistakes/)).toBeTruthy();
    expect(screen.getByText(/لا يُؤخذ إلا بالمشافهة/)).toBeTruthy();
    expect(screen.queryByTestId('recite-check-start')).toBeNull();
    fireEvent.press(screen.getByTestId('recite-check-agree'));
    expect(screen.getByTestId('recite-check-start')).toBeTruthy();
    screen.unmount();
    await open();
    expect(screen.queryByTestId('recite-check-notice')).toBeNull();
    // and it stays reachable from the sheet
    fireEvent.press(screen.getByTestId('recite-check-about'));
    expect(screen.getByTestId('recite-check-notice')).toBeTruthy();
  });

  it('records from the held ayah, sends it with the settings, and shows what it found', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true });
    await open();
    expect(screen.getByText(/From Al-Fātiḥah 1:1/)).toBeTruthy();
    await recite(3);
    expect(mockStopMic).toHaveBeenCalled();
    const [wav, from, to, settings] = mockCheck.mock.calls[0];
    expect(wav.length).toBe(44 + 3 * 16000 * 2);
    expect(from).toEqual({ sura: 1, ayah: 1 });
    expect(to).toBeNull();
    expect(settings).toMatchObject({ keep: true, munfasil: 4, aared: 0, letters: false });
    expect(screen.getByTestId('recite-check-summary')).toHaveTextContent('3 words, 1 tajweed note');
    expect(screen.getAllByText('Skipped')).toHaveLength(3);
    expect(screen.getByText('Madd ʿarid · about 2 counts, set to 4')).toBeTruthy();
    expect(screen.getByText(/kept as test data/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('recite-check-again'));
    expect(screen.getByTestId('recite-check-start')).toBeTruthy();
  });

  it('sends nothing for less than a second, and says why a check failed', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true });
    await open();
    fireEvent.press(screen.getByTestId('recite-check-start'));
    await flush();
    fireEvent.press(screen.getByTestId('recite-check-stop'));
    await flush();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(screen.getByTestId('recite-check-error')).toHaveTextContent(/too short/);
    fireEvent.press(screen.getByText('Try again'));
    mockCheck.mockRejectedValueOnce(new CheckError('offline'));
    await recite(2);
    expect(screen.getByTestId('recite-check-error')).toHaveTextContent(/Couldn’t reach the checker/);
  });

  it('keeps nothing when the switch is off', async () => {
    setReciteCheckSettings('u1', { noticeSeen: true });
    await open();
    fireEvent(screen.getByTestId('recite-check-keep'), 'valueChange', false);
    await recite(2);
    expect(mockCheck.mock.calls[0][3]).toMatchObject({ keep: false });
  });
});
