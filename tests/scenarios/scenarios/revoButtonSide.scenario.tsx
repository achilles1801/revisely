// Revo's button in either bottom corner (BEHAVIOUR.md REVO-41; Majd, Nov 23 2026: "let's make the revo icon bottom right
// be movable so a user can drag it to the other side ... and that position is saved in memory"). The real button and
// its store, with Gesture Handler's own events; the corner is kept per account on the phone.
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DesignProvider } from '../../../src/design/DesignContext';
import { ThemeProvider } from '../../../src/context/ThemeContext';
import { RevoButton } from '../../../src/components/revo/RevoButton';
import { dragPosition, dragTarget, positionSide, sidePosition, useRevoButtonSide } from '../../../src/lib/revo/buttonSide';

const KEY = (uid: string) => `@revo_button_side:${uid}`;
/** Between the two corners on this screen: its width less the insets and the disc. */
const ACROSS = Dimensions.get('window').width - 2 * 16 - 44;
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

function Host({ uid, onPress }: { uid: string; onPress: () => void }) {
  const { side, setSide } = useRevoButtonSide(uid);
  return side ? <RevoButton bottom={100} dot={false} onPress={onPress} side={side} onSide={setSide} /> : null;
}

async function show(uid: string, onPress: () => void = () => undefined) {
  const view = render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DesignProvider initial={{}}>
        <ThemeProvider>
          <Host uid={uid} onPress={onPress} />
        </ThemeProvider>
      </DesignProvider>
    </SafeAreaProvider>,
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return view;
}

async function drag(translationX: number, velocityX = 0) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId('revo-button-drag'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: translationX / 2, velocityX },
      { state: State.END, translationX, velocityX },
    ]);
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('Revo’s button in either corner', () => {
  it('[REVO-41] a drag past halfway settles in the other corner and is kept across launches; a short one goes back', async () => {
    let view = await show('u1');
    expect(screen.getByTestId('revo-button')).toBeTruthy();
    expect(await AsyncStorage.getItem(KEY('u1'))).toBeNull();

    // Less than halfway across: back where it was, nothing saved.
    await drag(-ACROSS * 0.3);
    expect(await AsyncStorage.getItem(KEY('u1'))).toBeNull();

    await drag(-ACROSS * 0.8);
    expect(await AsyncStorage.getItem(KEY('u1'))).toBe('left');
    view.unmount();

    // The next launch: on the left, and it comes back the same way.
    view = await show('u1');
    await drag(ACROSS * 0.8);
    expect(await AsyncStorage.getItem(KEY('u1'))).toBe('right');
    view.unmount();
  });

  it('[REVO-41] a flick counts where it was heading, and the corner is each account’s own', async () => {
    const view = await show('u1');
    await drag(-ACROSS * 0.2, -(ACROSS * 0.4) / 0.12);
    expect(await AsyncStorage.getItem(KEY('u1'))).toBe('left');
    expect(await AsyncStorage.getItem(KEY('u2'))).toBeNull();
    view.unmount();
    const other = await show('u2');
    await drag(100);
    expect(await AsyncStorage.getItem(KEY('u2'))).toBeNull();
    other.unmount();
  });

  it('[REVO-41] a tap still opens Revo; the end of a drag doesn’t', async () => {
    const open = jest.fn();
    const view = await show('u1', open);
    fireEvent.press(screen.getByTestId('revo-button'));
    expect(open).toHaveBeenCalledTimes(1);

    await drag(-ACROSS * 0.8);
    fireEvent.press(screen.getByTestId('revo-button'));
    expect(open).toHaveBeenCalledTimes(1);
    view.unmount();
  });

  it('[REVO-41] VoiceOver and TalkBack have an action that moves it, say where it went, and still open it', async () => {
    const said = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const open = jest.fn();
    const view = await show('u1', open);
    const button = () => screen.getByTestId('revo-button');
    expect(button().props.accessibilityActions).toContainEqual({ name: 'moveSide', label: 'Move to the left' });

    await act(async () => {
      fireEvent(button(), 'accessibilityAction', { nativeEvent: { actionName: 'moveSide' } });
    });
    expect(await AsyncStorage.getItem(KEY('u1'))).toBe('left');
    expect(said).toHaveBeenCalledWith('Moved to the left');
    expect(button().props.accessibilityActions).toContainEqual({ name: 'moveSide', label: 'Move to the right' });

    await act(async () => {
      fireEvent(button(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    });
    expect(open).toHaveBeenCalledTimes(1);
    said.mockRestore();
    view.unmount();
  });

  it('[REVO-41] the corners in Arabic: it starts on the left, and a drag right moves it to the right', () => {
    expect(sidePosition('right', false)).toBe(0);
    expect(sidePosition('left', false)).toBe(1);
    expect(sidePosition('left', true)).toBe(0);
    expect(positionSide(1, true)).toBe('right');
    // Right to left the finger's travel counts the other way: a drag right leaves the default (left) corner.
    expect(dragPosition(0, 361, 361, -1)).toBe(1);
    expect(dragPosition(0, -361, 361, -1)).toBe(0);
    expect(dragTarget(0.6, 0, 361, -1)).toBe(1);
    expect(dragTarget(0.4, 0, 361, 1)).toBe(0);
  });
});
