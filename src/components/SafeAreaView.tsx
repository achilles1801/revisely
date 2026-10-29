// React Native's own SafeAreaView pads only on iOS: on Android it is a plain View.
// With edge-to-edge (SDK 54, enforced from Android 15) the app draws under the status
// and navigation bars, so screens that used it put their top bar under the clock.
// iOS keeps React Native's exactly as before; Android uses safe-area-context's, which
// pads by the system bars where the view meets them. React Native's is read only on
// iOS: reading it logs a deprecation warning.
import { Platform } from 'react-native';
import type { SafeAreaView as NativeSafeAreaView } from 'react-native';
import { SafeAreaView as ContextSafeAreaView } from 'react-native-safe-area-context';

export const SafeAreaView: typeof NativeSafeAreaView =
  Platform.OS === 'android'
    ? (ContextSafeAreaView as unknown as typeof NativeSafeAreaView)
    : // eslint-disable-next-line @typescript-eslint/no-require-imports
      (require('react-native') as typeof import('react-native')).SafeAreaView;
