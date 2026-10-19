import { createNavigationContainerRef } from '@react-navigation/native';
import type { MainTabParamList } from './MainNavigator';

/** Lets non-screen code (e.g. the reading timer) navigate. */
export const navigationRef = createNavigationContainerRef<MainTabParamList>();

/** Open one day of Activity from anywhere, on top of the Home stack. */
export function navigateToActivityDay(date: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.navigate('Home', { screen: 'ActivityDay', params: { date }, initial: false });
}
