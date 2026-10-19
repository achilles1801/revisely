import { createNavigationContainerRef } from '@react-navigation/native';
import type { MainTabParamList } from './MainNavigator';

/** Lets non-screen code (e.g. the reading timer) navigate. */
export const navigationRef = createNavigationContainerRef<MainTabParamList>();

/** Open one day of Activity from anywhere, on top of the Home stack; with
 *  focusRecordingId, scrolled to that recording. */
export function navigateToActivityDay(date: string, focusRecordingId?: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Home', {
    screen: 'ActivityDay',
    params: { date, ...(focusRecordingId ? { focusRecordingId } : {}) },
    initial: false,
  });
}
