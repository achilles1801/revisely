import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  useFrameCallback: () => ({ setActive: jest.fn(), isActive: false, callbackId: -1 }),
}));
require('react-native-gesture-handler/jestSetup');
jest.mock('@expo/vector-icons', () => {
  const { Text: T } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <T testID={`icon-${name}`} /> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));

import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { moveDay, removeDay } from '../../../lib/planBuilder';
import { ACTION_WIDTH, ReorderableDayList, ScrollLink } from '../ReorderableDayList';
import { ACCENTS, paletteV2 } from '../../../theme/v2';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const ROW = 61;
const today = new Date(2026, 9, 27); // a Tuesday
const scroll = {
  ref: { current: null },
  offset: { value: 0 },
  contentHeight: { value: 2000 },
} as unknown as ScrollLink;

// Juz 1 (pages 1–3), Juz 2 (22–24), a rest day, Juz 3 (42–44).
const DAYS = [[1, 2, 3], [22, 23, 24], [], [42, 43, 44]];

function Harness({
  initial = DAYS,
  limit,
  onMoveSpy,
  onDeleteSpy,
  onPress,
}: {
  initial?: number[][];
  limit?: number;
  onMoveSpy?: jest.Mock;
  onDeleteSpy?: jest.Mock;
  onPress?: jest.Mock;
}) {
  const [days, setDays] = React.useState(initial);
  return (
    <>
      <ReorderableDayList
        days={days}
        limit={limit}
        today={today}
        scroll={scroll}
        onPressDay={onPress ?? jest.fn()}
        onMove={(from, to) => {
          onMoveSpy?.(from, to);
          setDays((d) => moveDay(d, from, to));
        }}
        onDelete={(i) => {
          onDeleteSpy?.(i);
          setDays((d) => removeDay(d, i));
        }}
      />
      <Text testID="days">{JSON.stringify(days)}</Text>
    </>
  );
}

const ui = (el: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{el}</ThemeProvider>
  </DesignProvider>
);

const days = () => JSON.parse(String(screen.getByTestId('days').props.children));
const labelOf = (i: number) => screen.getByTestId(`day-item-${i}`).props.accessibilityLabel as string;

function drag(index: number, dy: number) {
  act(() => {
    fireGestureHandler(getByGestureTestId(`day-drag-${index}`), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationY: 0, absoluteY: 300 },
      { state: State.ACTIVE, translationY: dy, absoluteY: 300 + dy },
      { state: State.END, translationY: dy, absoluteY: 300 + dy },
    ]);
  });
}

function swipe(index: number, dx: number, velocityX = 0) {
  act(() => {
    fireGestureHandler(getByGestureTestId(`day-swipe-${index}`), [
      { state: State.BEGAN },
      { state: State.ACTIVE, translationX: -14 },
      { state: State.ACTIVE, translationX: dx },
      { state: State.END, translationX: dx, velocityX },
    ]);
  });
}

async function mount(props: React.ComponentProps<typeof Harness> = {}) {
  render(ui(<Harness {...props} />));
  await act(async () => {});
  // The row's width, for how far a swipe went.
  fireEvent(screen.getByTestId('day-list'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 360, height: ROW * 4 } },
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('dragging a day', () => {
  it('drops what was on it on another date; the dates stay where they are', async () => {
    const onMoveSpy = jest.fn();
    await mount({ onMoveSpy });
    drag(0, ROW * 2 + 10);
    await act(async () => {});
    expect(onMoveSpy).toHaveBeenCalledWith(0, 2);
    expect(days()).toEqual([[22, 23, 24], [], [1, 2, 3], [42, 43, 44]]);
    // The first date is still Today; Juz 1 is now on Thursday.
    expect(labelOf(0)).toMatch(/^Today: Juz 2/);
    expect(labelOf(2)).toMatch(/^Thursday.*: Juz 1/);
  });

  it('lifting buzzes once, and each date it passes ticks', async () => {
    await mount();
    drag(0, ROW * 3);
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.selectionAsync).toHaveBeenCalled();
  });

  it('dropped back on its own date, nothing changes', async () => {
    const onMoveSpy = jest.fn();
    await mount({ onMoveSpy });
    drag(1, 20);
    await act(async () => {});
    expect(onMoveSpy).not.toHaveBeenCalled();
    expect(days()).toEqual(DAYS);
  });

  it('the last day dragged far above the top lands first', async () => {
    const onMoveSpy = jest.fn();
    await mount({ onMoveSpy });
    drag(3, -1000);
    await act(async () => {});
    expect(onMoveSpy).toHaveBeenCalledWith(3, 0);
    expect(days()[0]).toEqual([42, 43, 44]);
  });

  it('a rest day can be moved too', async () => {
    await mount();
    drag(2, -ROW * 2);
    await act(async () => {});
    expect(days()).toEqual([[], [1, 2, 3], [22, 23, 24], [42, 43, 44]]);
    expect(labelOf(0)).toMatch(/^Today: Rest Day/);
  });

  it('two drags in a row each move the right day', async () => {
    await mount();
    drag(0, ROW * 3); // Juz 1 to the end
    await act(async () => {});
    drag(0, ROW); // now Juz 2, one down
    await act(async () => {});
    expect(days()).toEqual([[], [22, 23, 24], [42, 43, 44], [1, 2, 3]]);
  });

  it('only among the days shown when the list is folded', async () => {
    const onMoveSpy = jest.fn();
    await mount({ limit: 2, onMoveSpy });
    expect(screen.queryByTestId('day-item-2')).toBeNull();
    drag(0, ROW * 5);
    await act(async () => {});
    expect(onMoveSpy).toHaveBeenCalledWith(0, 1);
  });
});

describe('swiping a day', () => {
  it('a long swipe deletes it, and the days after it move up a date', async () => {
    const onDeleteSpy = jest.fn();
    await mount({ onDeleteSpy });
    swipe(1, -300);
    await act(async () => {});
    expect(onDeleteSpy).toHaveBeenCalledWith(1);
    expect(days()).toEqual([[1, 2, 3], [], [42, 43, 44]]);
    expect(labelOf(1)).toMatch(/^Tomorrow: Rest Day/);
  });

  it('a shorter swipe uncovers Delete, which deletes', async () => {
    const onDeleteSpy = jest.fn();
    await mount({ onDeleteSpy });
    swipe(3, -ACTION_WIDTH);
    await act(async () => {});
    expect(onDeleteSpy).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('day-delete-3'));
    await act(async () => {});
    expect(onDeleteSpy).toHaveBeenCalledWith(3);
    expect(days()).toEqual([[1, 2, 3], [22, 23, 24], []]);
  });

  it('a short swipe deletes nothing', async () => {
    const onDeleteSpy = jest.fn();
    await mount({ onDeleteSpy });
    swipe(0, -20);
    await act(async () => {});
    expect(onDeleteSpy).not.toHaveBeenCalled();
  });

  it('the only day left cannot be deleted', async () => {
    await mount({ initial: [[1, 2]] });
    expect(screen.queryByTestId('day-delete-0')).toBeNull();
    const actions = screen.getByTestId('day-item-0').props.accessibilityActions.map(
      (a: { name: string }) => a.name,
    );
    expect(actions).toEqual(['activate']);
  });

  it('Delete on its red is readable (4.5:1) and the red stands out (3:1), every accent, both modes', () => {
    for (const accent of ACCENTS) {
      for (const dark of [false, true]) {
        const p = paletteV2(dark, accent);
        expect(contrast(p.onRedFill, p.redFill)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.redFill, p.bg)).toBeGreaterThanOrEqual(3);
      }
    }
    // White on #DC2626, in both modes.
    expect([paletteV2(false).redFill, paletteV2(true).redFill, paletteV2(true).onRedFill]).toEqual([
      '#DC2626',
      '#DC2626',
      '#FFFFFF',
    ]);
  });
});

describe('tapping and VoiceOver', () => {
  it('a tap opens the day it is on', async () => {
    const onPress = jest.fn();
    await mount({ onPress });
    act(() => {
      fireGestureHandler(getByGestureTestId('day-tap-2'), [
        { state: State.BEGAN },
        { state: State.ACTIVE },
        { state: State.END },
      ]);
    });
    expect(onPress).toHaveBeenCalledWith(2);
  });

  it('Move up, Move down and Delete, without the first day moving up or the last down', async () => {
    const onMoveSpy = jest.fn();
    await mount({ onMoveSpy });
    const names = (i: number) =>
      screen.getByTestId(`day-item-${i}`).props.accessibilityActions.map((a: { name: string }) => a.name);
    expect(names(0)).toEqual(['activate', 'moveDown', 'delete']);
    expect(names(1)).toEqual(['activate', 'moveUp', 'moveDown', 'delete']);
    expect(names(3)).toEqual(['activate', 'moveUp', 'delete']);

    fireEvent(screen.getByTestId('day-item-1'), 'accessibilityAction', {
      nativeEvent: { actionName: 'moveUp' },
    });
    await act(async () => {});
    expect(onMoveSpy).toHaveBeenCalledWith(1, 0);
    expect(days()[0]).toEqual([22, 23, 24]);

    fireEvent(screen.getByTestId('day-item-3'), 'accessibilityAction', {
      nativeEvent: { actionName: 'delete' },
    });
    await act(async () => {});
    expect(days()).toEqual([[22, 23, 24], [1, 2, 3], []]);
  });

  it('each day reads its date and what is on it', async () => {
    await mount();
    expect(labelOf(0)).toMatch(/^Today: Juz 1, .*3 pages/);
    expect(labelOf(1)).toMatch(/^Tomorrow: Juz 2/);
    expect(labelOf(2)).toMatch(/^Thursday.*: Rest Day/);
  });
});
