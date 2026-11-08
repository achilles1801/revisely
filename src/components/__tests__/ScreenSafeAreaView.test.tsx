// A whole screen's safe-area padding is in its first render (ScreenSafeAreaView), from the insets
// the app's root provider already has: the native safe-area views apply theirs after mounting,
// through a state update that waits for the JavaScript thread, and onboarding's Continue sat 34pt
// low for seconds while sign-up kept it busy (E2E, Nov 2026).

import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { ScreenSafeAreaView } from '../SafeAreaView';

const insets = { top: 62, bottom: 34, left: 0, right: 0 };

it('pads by the provider’s insets on its first render, over its own style', () => {
  render(
    <SafeAreaInsetsContext.Provider value={insets}>
      <ScreenSafeAreaView style={{ flex: 1 }} testID="screen">
        <Text>Continue</Text>
      </ScreenSafeAreaView>
    </SafeAreaInsetsContext.Provider>,
  );
  const style = StyleSheet.flatten(screen.getByTestId('screen').props.style);
  expect(style).toMatchObject({ flex: 1, paddingTop: 62, paddingBottom: 34, paddingLeft: 0, paddingRight: 0 });
  expect(screen.getByText('Continue')).toBeTruthy();
});

it('follows the insets when they change (rotation, a new window size)', () => {
  const { rerender } = render(
    <SafeAreaInsetsContext.Provider value={insets}>
      <ScreenSafeAreaView testID="screen" />
    </SafeAreaInsetsContext.Provider>,
  );
  rerender(
    <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 21, left: 59, right: 59 }}>
      <ScreenSafeAreaView testID="screen" />
    </SafeAreaInsetsContext.Provider>,
  );
  expect(StyleSheet.flatten(screen.getByTestId('screen').props.style)).toMatchObject({ paddingTop: 0, paddingBottom: 21, paddingLeft: 59, paddingRight: 59 });
});
