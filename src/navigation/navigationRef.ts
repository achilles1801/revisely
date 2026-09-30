import { createNavigationContainerRef } from '@react-navigation/native';
import type { MainTabParamList } from './MainNavigator';

/** Lets non-screen code (e.g. the reading timer) navigate. */
export const navigationRef = createNavigationContainerRef<MainTabParamList>();
