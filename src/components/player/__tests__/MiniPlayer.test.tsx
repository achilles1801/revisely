import React from 'react';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`} /> };
});
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

// The recitation as the app sees it: a state, its listeners and the controls.
let mockState: Record<string, unknown> = { status: 'idle', verse: null };
const mockListeners = new Set<(s: unknown) => void>();
const mockRecitation = {
  getState: () => mockState,
  subscribe: (l: (s: unknown) => void) => {
    mockListeners.add(l);
    return () => mockListeners.delete(l);
  },
  getVoice: () => 'husary:murattal',
  pause: jest.fn(),
  resume: jest.fn(),
  stop: jest.fn(),
};
jest.mock('../../../lib/recitation', () => ({
  ...jest.requireActual('../../../lib/recitation'),
  getRecitation: () => mockRecitation,
}));

import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { MiniPlayer, MINI_PLAYER_GAP, MINI_PLAYER_HEIGHT } from '../MiniPlayer';
import { resetPresenters, setPresenting } from '../../../lib/nowPlaying';
import { useTabBarFootprint, useTabBarHeight } from '../../../navigation/TabBar';
import { openReaderAt } from '../../../navigation/openReader';

const wrap = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);
const emit = (next: Record<string, unknown>) => {
  mockState = next;
  act(() => mockListeners.forEach((l) => l(next)));
};
const playing = { status: 'playing', verse: { sura: 2, ayah: 13 }, owner: 'reader' };

beforeEach(async () => {
  jest.clearAllMocks();
  mockState = { status: 'idle', verse: null };
  resetPresenters();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

async function show(onOpen = jest.fn()) {
  render(wrap(<MiniPlayer bottom={100} onOpen={onOpen} />));
  await act(async () => {});
  return onOpen;
}

describe('the mini player', () => {
  it('nothing while nothing recites', async () => {
    await show();
    expect(screen.queryByTestId('mini-player')).toBeNull();
  });

  it('a recitation off screen: the verse and the reciter on one line, nothing else', async () => {
    await show();
    emit(playing);
    expect(screen.getByTestId('mini-player')).toBeTruthy();
    expect(screen.getByText(/Al-Baqarah 2:13/)).toBeTruthy();
    expect(screen.getByText(/Al-Husary \(Murattal\)/)).toBeTruthy();
    expect(screen.getByLabelText('Pause recitation')).toBeTruthy();
    expect(screen.getByLabelText('Stop recitation')).toBeTruthy();
    expect(screen.getByLabelText('Open in the reader')).toBeTruthy();
    // No speed, options or timer.
    expect(screen.queryByText(/×/)).toBeNull();
    expect(screen.queryByLabelText(/options|timer|speed/i)).toBeNull();
  });

  it('steps aside while a screen shows the recitation itself (the reader at that verse)', async () => {
    await show();
    emit(playing);
    act(() => setPresenting('reader', true));
    expect(screen.queryByTestId('mini-player')).toBeNull();
    act(() => setPresenting('reader', false));
    expect(screen.getByTestId('mini-player')).toBeTruthy();
  });

  it('▶/❚❚ pauses and resumes, ✕ stops, and › or the line opens the reader at the verse', async () => {
    const onOpen = await show();
    emit(playing);
    fireEvent.press(screen.getByTestId('mini-play-pause'));
    expect(mockRecitation.pause).toHaveBeenCalledTimes(1);
    emit({ ...playing, status: 'paused' });
    expect(screen.getByLabelText('Play recitation')).toBeTruthy();
    fireEvent.press(screen.getByTestId('mini-play-pause'));
    expect(mockRecitation.resume).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('mini-open'));
    fireEvent.press(screen.getByTestId('mini-label'));
    expect(onOpen).toHaveBeenCalledTimes(2);
    expect(onOpen).toHaveBeenLastCalledWith({ sura: 2, ayah: 13 });
    fireEvent.press(screen.getByTestId('mini-stop'));
    expect(mockRecitation.stop).toHaveBeenCalledTimes(1);
  });

  it('loading shows a spinner; a verse that failed says so and ▶ tries again', async () => {
    await show();
    emit({ ...playing, status: 'loading' });
    expect(screen.getByLabelText('Pause recitation')).toBeTruthy();
    emit({ ...playing, status: 'error' });
    expect(screen.getByText(/Couldn’t play/)).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Try again'));
    expect(mockRecitation.resume).toHaveBeenCalledTimes(1);
  });
});

describe('room for it', () => {
  it('screens leave room for the mini player above the tab bar while it shows', () => {
    const { result } = renderHook(() => ({ footprint: useTabBarFootprint(), bar: useTabBarHeight() }));
    expect(result.current.footprint).toBe(result.current.bar);
    emit(playing);
    expect(result.current.footprint).toBe(result.current.bar + MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP);
    act(() => setPresenting('reader', true));
    expect(result.current.footprint).toBe(result.current.bar);
  });

  it('› opens the reader in the Read tab at the verse’s page', () => {
    const navigate = jest.fn();
    openReaderAt({ navigate }, { sura: 2, ayah: 13 });
    expect(navigate).toHaveBeenCalledWith('Read', { screen: 'QuranReader', params: { pageNumber: 3 } });
  });
});
