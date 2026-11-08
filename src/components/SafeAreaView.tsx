// React Native's own SafeAreaView pads only on iOS: on Android it is a plain View.
// With edge-to-edge (SDK 54, enforced from Android 15) the app draws under the status
// and navigation bars, so screens that used it put their top bar under the clock.
// iOS keeps React Native's exactly as before; Android uses safe-area-context's, which
// pads by the system bars where the view meets them. React Native's is read only on
// iOS: reading it logs a deprecation warning.
import React from 'react';
import { Platform, View, type ViewProps } from 'react-native';
import type { SafeAreaView as NativeSafeAreaView } from 'react-native';
import { SafeAreaView as ContextSafeAreaView, useSafeAreaInsets, type SafeAreaViewProps } from 'react-native-safe-area-context';

export const SafeAreaView: typeof NativeSafeAreaView =
  Platform.OS === 'android'
    ? (ContextSafeAreaView as unknown as typeof NativeSafeAreaView)
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('react-native') as typeof import('react-native')).SafeAreaView;

/**
 * Pads the top edge only. A screen in the tab bar (or one with its own bottom
 * bar) already leaves room for the home indicator at the bottom, so padding
 * that edge here too leaves a gap above the bar.
 */
export function TopSafeAreaView(props: SafeAreaViewProps) {
  return <ContextSafeAreaView edges={['top']} {...props} />;
}

/**
 * A whole screen padded by the safe area from its first frame. Both native safe-area views (React
 * Native's and safe-area-context's) learn the insets once mounted and apply them through a state
 * update, which waits for the JavaScript thread: a screen shown while it was busy (sign-up creating
 * 604 pages, about 3 s on a CI simulator) sat without its bottom inset, 34pt low on an iPhone, then
 * jumped up. A tap aimed at the button where it was landed beside it (E2E, onboarding's Continue,
 * Nov 2026). These insets come from the provider at the app's root, which renders nothing until it
 * knows them, so they are right in the first render. Only for a view that fills the window: they
 * are the window's.
 */
export function ScreenSafeAreaView({ style, ...props }: ViewProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[style, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}
      {...props}
    />
  );
}
