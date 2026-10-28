import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`} /> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { AudioOptionsSheet } from '../AudioOptionsSheet';
import { SpeedMenu } from '../../reader/SpeedMenu';
import { WheelPicker } from '../../v2/WheelPicker';
import { DEFAULT_PLAYBACK, PlaybackOptions } from '../../../lib/playbackPlan';

const wrap = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

beforeEach(async () => {
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

/** The sheet, its options kept in a little state of its own as the app does. */
async function open(initial: Partial<PlaybackOptions> = {}, start = { sura: 2, ayah: 13 }) {
  const onPlay = jest.fn();
  const onChangeReciter = jest.fn();
  const changes: Partial<PlaybackOptions>[] = [];
  function Harness() {
    const [options, setOptions] = React.useState<PlaybackOptions>({ ...DEFAULT_PLAYBACK, ...initial });
    return (
      <AudioOptionsSheet
        visible
        onClose={() => {}}
        start={start}
        options={options}
        onChangeOptions={(p) => {
          changes.push(p);
          setOptions((o) => ({ ...o, ...p }));
        }}
        reciter="husary:muallim"
        onChangeReciter={onChangeReciter}
        onPlay={onPlay}
      />
    );
  }
  render(wrap(<Harness />));
  await act(async () => {});
  return { onPlay, onChangeReciter, changes };
}

describe('Audio Options', () => {
  it('a header with close, the title and Play; the reciter, the speed, the ayahs, each verse', async () => {
    await open();
    expect(screen.getByText('Audio Options')).toBeTruthy();
    expect(screen.getByTestId('audio-close')).toBeTruthy();
    expect(screen.getByLabelText('Play with these settings')).toBeTruthy();
    expect(screen.getByText('Reciter')).toBeTruthy();
    expect(screen.getByText(/Husary/)).toBeTruthy();
    expect(screen.getByText('Playback speed')).toBeTruthy();
    expect(screen.getByText('Ayahs to play')).toBeTruthy();
    expect(screen.getByText('Each verse')).toBeTruthy();
    expect(screen.getByText('Pause after each verse')).toBeTruthy();
    // No "Play set of verses".
    expect(screen.queryByText(/set of verses/i)).toBeNull();
  });

  it('From starts at the verse given; To where Play up to puts it (the juz by default)', async () => {
    const { onPlay } = await open();
    expect(screen.getByText('Al-Baqarah 2:13')).toBeTruthy();
    expect(screen.getByText('Al-Baqarah 2:141')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Play with these settings'));
    expect(onPlay).toHaveBeenCalledWith({ from: { sura: 2, ayah: 13 }, to: { sura: 2, ayah: 141 } });
  });

  it('Page, Surah and Juz’ move To and are kept', async () => {
    const { changes } = await open();
    fireEvent.press(screen.getByTestId('pill-surah'));
    expect(screen.getByText('Al-Baqarah 2:286')).toBeTruthy();
    fireEvent.press(screen.getByTestId('pill-page'));
    // Page 3 holds 2:6–2:16.
    expect(screen.getByText('Al-Baqarah 2:16')).toBeTruthy();
    expect(changes).toEqual([{ playUpTo: 'surah' }, { playUpTo: 'page' }]);
  });

  it('choosing To yourself makes it Custom; To never comes before From', async () => {
    const { changes, onPlay } = await open();
    fireEvent.press(screen.getByTestId('audio-to'));
    // The To wheel starts at From: its first ayah is 13.
    expect(screen.getByTestId('audio-to-picker-ayah-13')).toBeTruthy();
    expect(screen.queryByTestId('audio-to-picker-ayah-12')).toBeNull();
    fireEvent.press(screen.getByTestId('audio-to-picker-ayah-40'));
    expect(changes).toEqual([{ playUpTo: 'custom' }]);
    fireEvent.press(screen.getByLabelText('Play with these settings'));
    expect(onPlay).toHaveBeenCalledWith({ from: { sura: 2, ayah: 13 }, to: { sura: 2, ayah: 40 } });
  });

  it('moving From past a Custom To brings To along', async () => {
    const { onPlay } = await open({ playUpTo: 'custom' });
    fireEvent.press(screen.getByTestId('audio-from'));
    fireEvent.press(screen.getByTestId('audio-from-picker-surah-3'));
    fireEvent.press(screen.getByLabelText('Play with these settings'));
    const { from, to } = onPlay.mock.calls[0][0];
    expect(from).toEqual({ sura: 3, ayah: 13 });
    expect(to.sura).toBeGreaterThanOrEqual(3);
  });

  it('repeat from a wheel (Loop to 10×), the pause from pills, the speed from a stepper', async () => {
    const { changes } = await open();
    fireEvent.press(screen.getByTestId('audio-repeat'));
    fireEvent.press(screen.getByTestId('audio-repeat-picker-3'));
    fireEvent.press(screen.getByTestId('audio-repeat-picker-Infinity'));
    fireEvent.press(screen.getByTestId('pill-1'));
    fireEvent.press(screen.getByLabelText(/Increase playback speed/));
    expect(changes).toEqual([{ repeat: 3 }, { repeat: Infinity }, { pauseFactor: 1 }, { speed: 1.1 }]);
    expect(screen.getByText('Loop')).toBeTruthy();
  });

  it('the reciter row opens the picker in the same sheet, with Back', async () => {
    await open();
    fireEvent.press(screen.getByTestId('audio-reciter'));
    expect(screen.getByLabelText('Back')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Back'));
    expect(screen.getByText('Audio Options')).toBeTruthy();
  });
});

describe('the speed menu', () => {
  it('lists the speeds fastest first, the current one checked; a choice closes it', async () => {
    const onChange = jest.fn();
    const onClose = jest.fn();
    render(wrap(<SpeedMenu anchor={{ x: 100, y: 700, width: 40, height: 28 }} value={1.25} onChange={onChange} onClose={onClose} />));
    await act(async () => {});
    const labels = screen.getAllByText(/×$/).map((t) => t.props.children);
    expect(labels).toEqual(['2×', '1.75×', '1.5×', '1.25×', '1.1×', '1×', '0.9×', '0.75×', '0.5×', '0.25×']);
    expect(screen.getByTestId('speed-1.25').props.accessibilityState).toMatchObject({ selected: true });
    fireEvent.press(screen.getByTestId('speed-0.75'));
    expect(onChange).toHaveBeenCalledWith(0.75);
    expect(onClose).toHaveBeenCalled();
  });

  it('nothing when there is no chip to hang from', async () => {
    render(wrap(<SpeedMenu anchor={null} value={1} onChange={jest.fn()} onClose={jest.fn()} />));
    await act(async () => {});
    expect(screen.queryByTestId('speed-menu')).toBeNull();
  });
});


describe('the wheel', () => {
  const items = ['a', 'b', 'c', 'd', 'e'].map((k) => ({ key: k, label: k.toUpperCase() }));

  it('a tapped row is picked once, and the wheel is moved only by that scroll', async () => {
    const onChange = jest.fn();
    function Harness() {
      const [index, setIndex] = React.useState(1);
      return (
        <WheelPicker
          items={items}
          index={index}
          onChange={(i) => {
            onChange(i);
            setIndex(i);
          }}
          label="Letter"
          testID="w"
        />
      );
    }
    render(wrap(<Harness />));
    await act(async () => {});
    const wheel = () => screen.UNSAFE_getByType(ScrollView);
    expect(wheel().props.contentOffset).toEqual({ x: 0, y: 40 });
    fireEvent.press(screen.getByTestId('w-c'));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(2);
    // The start offset stays put: moving it too would move the wheel a second
    // row (seen on a phone: 3× → tap 2× → 1×).
    expect(wheel().props.contentOffset).toEqual({ x: 0, y: 40 });
    // The scroll the tap started ends on that row: nothing more.
    fireEvent(wheel(), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: 80 } } });
    expect(onChange).toHaveBeenCalledTimes(1);
    // Scrolled by hand to the last row.
    fireEvent(wheel(), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 0, y: 160 } } });
    expect(onChange).toHaveBeenLastCalledWith(4);
  });
});
