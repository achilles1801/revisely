// React Native's own SafeAreaView pads only on iOS: on Android it is a plain View.
// With edge-to-edge (SDK 54, enforced from Android 15) the app draws under the status
// and navigation bars, so screens that used it put their top bar under the clock.
// iOS keeps React Native's exactly as before; Android uses safe-area-context's, which
// pads by the system bars where the view meets them.
import { Platform, SafeAreaView as NativeSafeAreaView } from 'react-native';
import { SafeAreaView as ContextSafeAreaView } from 'react-native-safe-area-context';

export const SafeAreaView = (
  Platform.OS === 'android' ? ContextSafeAreaView : NativeSafeAreaView
) as typeof NativeSafeAreaView;
