import React from 'react';
import { Animated, Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import { DesignProvider } from '../DesignContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { Sheet } from '../../components/v2/Sheet';
import { PillTabs } from '../../components/v2/PillTabs';
import { OptionSheet } from '../../components/OptionSheet';
import { SessionMenuSheet } from '../../components/revision/SessionMenuSheet';
import { SectionFooter } from '../../components/plan/Grouped';
import { DEFAULT_ACCENT, paletteLight, paletteV2 } from '../../theme/v2';

const v2 = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

const flat = (style: unknown) => Object.assign({}, ...[style].flat(5).filter(Boolean));

describe('sheets in the new design', () => {
  it('a sheet: handle, centred title, Cancel and Save in the header, solid 20pt corners', async () => {
    const onSave = jest.fn();
    const onClose = jest.fn();
    render(
      v2(
        <Sheet
          visible
          onClose={onClose}
          title="Pages read"
          left={{ label: 'Cancel', onPress: onClose }}
          right={{ label: 'Done', onPress: onSave, strong: true }}
          testID="sheet"
        >
          <Text>Body</Text>
        </Sheet>,
      ),
    );
    await act(async () => {});
    const sheet = flat(screen.getByTestId('sheet').props.style);
    expect(sheet.backgroundColor).toBe(paletteLight.sheet);
    expect(sheet.borderTopLeftRadius).toBe(20);
    expect(screen.getByText('Pages read')).toBeTruthy();
    fireEvent.press(screen.getByText('Done'));
    expect(onSave).toHaveBeenCalled();
    fireEvent.press(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('a pick-one sheet becomes the menu: grouped choices, the current one checked', async () => {
    const onSelect = jest.fn();
    render(
      v2(
        <OptionSheet
          visible
          title="Show"
          value="b"
          onSelect={onSelect}
          onClose={jest.fn()}
          sections={[
            { title: 'Kind', options: [{ value: 'a', label: 'All' }, { value: 'b', label: 'Revision' }] },
          ]}
        />,
      ),
    );
    await act(async () => {});
    expect(screen.getByText('Kind')).toBeTruthy();
    expect(screen.getByTestId('sheet-action-b').props.accessibilityState).toMatchObject({ selected: true });
    expect(screen.getByTestId('sheet-action-a').props.accessibilityState).toMatchObject({ selected: false });
    expect(screen.getByTestId('sheet-cancel')).toBeTruthy();
  });

  it('the session menu is the same menu, destructive actions in red', async () => {
    render(
      v2(
        <SessionMenuSheet
          visible
          onClose={jest.fn()}
          actions={[
            { key: 'save', label: 'Save and exit', icon: 'save-outline', onPress: jest.fn() },
            { key: 'end', label: 'End session', icon: 'flag-outline', destructive: true, onPress: jest.fn() },
          ]}
        />,
      ),
    );
    await act(async () => {});
    expect(screen.getByText('Session')).toBeTruthy();
    expect(flat(screen.getByText('End session').props.style).color).toBe(paletteLight.red);
  });

  it('reopened while it is still closing, the sheet stays open', async () => {
    // Animations finish at once in tests; hold each one so the closing one can
    // be interrupted, as reopening it does on a phone.
    const ends: ((r: { finished: boolean }) => void)[] = [];
    const timing = jest.spyOn(Animated, 'timing').mockImplementation(
      () =>
        ({
          start: (cb?: (r: { finished: boolean }) => void) => ends.push(cb ?? (() => {})),
          stop: () => {},
          reset: () => {},
        }) as unknown as Animated.CompositeAnimation,
    );
    try {
      const sheet = (visible: boolean) =>
        v2(
          <Sheet visible={visible} onClose={() => {}}>
            <Text>Body</Text>
          </Sheet>,
        );
      const view = render(sheet(true));
      await act(async () => {});
      view.rerender(sheet(false));
      await act(async () => {});
      const closing = ends[ends.length - 1];
      view.rerender(sheet(true));
      await act(async () => {
        closing({ finished: false });
      });
      expect(screen.getByText('Body')).toBeTruthy();
      // Closed for good, it goes.
      view.rerender(sheet(false));
      await act(async () => {
        ends[ends.length - 1]({ finished: true });
      });
      expect(screen.queryByText('Body')).toBeNull();
    } finally {
      timing.mockRestore();
    }
  });

  it('a warning under a section is advice in full ink, not an error in red', async () => {
    render(
      v2(
        <>
          <SectionFooter>Tap a day to change it.</SectionFooter>
          <SectionFooter tone="warning">A 40-day cycle is a long gap.</SectionFooter>
        </>,
      ),
    );
    await act(async () => {});
    const p = paletteV2(false, DEFAULT_ACCENT);
    expect(flat(screen.getByText('Tap a day to change it.').props.style).color).toBe(p.secondary);
    expect(flat(screen.getByText('A 40-day cycle is a long gap.').props.style).color).toBe(p.text);
  });

  it('segmented controls are pills: the chosen one solid', async () => {
    const onChange = jest.fn();
    render(
      v2(
        <PillTabs
          options={[
            { value: 'stopwatch', label: 'Stopwatch' },
            { value: 'timer', label: 'Timer' },
          ]}
          value="stopwatch"
          onChange={onChange}
        />,
      ),
    );
    await act(async () => {});
    expect(flat(screen.getByTestId('pill-stopwatch').props.style).backgroundColor).toBe(paletteV2(false, DEFAULT_ACCENT).primary);
    expect(flat(screen.getByTestId('pill-timer').props.style).borderWidth).toBe(1);
    fireEvent.press(screen.getByTestId('pill-timer'));
    expect(onChange).toHaveBeenCalledWith('timer');
    fireEvent.press(screen.getByTestId('pill-stopwatch'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
