import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { SwipeRow } from '../SwipeRow';

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <RNText testID={`icon-${name}`}>{name}</RNText> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

async function renderRow(props: Partial<React.ComponentProps<typeof SwipeRow>> = {}) {
  const onDelete = jest.fn();
  const onHold = jest.fn();
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <SwipeRow testID="row" onDelete={onDelete} onHold={onHold} actions={[{ name: 'copy', label: 'Copy', onPress: jest.fn() }]} {...props}>
          <Text>a note</Text>
        </SwipeRow>
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
  return { onDelete, onHold };
}

describe('SwipeRow', () => {
  it('shows its children, with the red Delete action behind them', async () => {
    await renderRow();
    expect(screen.getByText('a note')).toBeTruthy();
    expect(screen.getByLabelText('Delete')).toBeTruthy();
  });

  it('the Delete action calls onDelete', async () => {
    const { onDelete } = await renderRow();
    fireEvent.press(screen.getByLabelText('Delete'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('VoiceOver: "Delete" and each extra action run in place of the gestures', async () => {
    const copy = jest.fn();
    const { onDelete, onHold } = await renderRow({ actions: [{ name: 'copy', label: 'Copy', onPress: copy }] });
    fireEvent(screen.getByTestId('row'), 'accessibilityAction', { nativeEvent: { actionName: 'delete' } });
    fireEvent(screen.getByTestId('row'), 'accessibilityAction', { nativeEvent: { actionName: 'copy' } });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(onHold).not.toHaveBeenCalled();
  });
});

describe('the swipe runs as gesture handler’s swipeable, on the UI thread', () => {
  it('a row is a ReanimatedSwipeable: the drag follows the finger and snaps on release', async () => {
    const ReanimatedSwipeable = require('react-native-gesture-handler/ReanimatedSwipeable').default;
    const { UNSAFE_getByType } = await (async () => {
      const onDelete = jest.fn();
      const r = render(
        <DesignProvider initial={{}}>
          <ThemeProvider>
            <SwipeRow testID="row" onDelete={onDelete} onHold={jest.fn()}>
              <Text>a note</Text>
            </SwipeRow>
          </ThemeProvider>
        </DesignProvider>,
      );
      await act(async () => {});
      return r;
    })();
    expect(UNSAFE_getByType(ReanimatedSwipeable)).toBeTruthy();
  });
});
