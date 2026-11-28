// [ACT-35] A section page puts its range chip where the name keeps room (lib/activitySections sectionBar): in the bar at
// the default text size, at the top of the page with the largest. The rule's widths are measured in sectionBar.test.ts.

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../context/ThemeContext';
import ActivitySectionScreen from '../ActivitySectionScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useRoute: () => ({ params: { section: 'memorization' } }),
}));
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: { id: 'u1' } }) }));
jest.mock('../../../components/activity/ActivityBlocksViews', () => ({ ActivityBlocksViews: () => null }));
jest.mock('../../../components/help/HelpButton', () => ({ HelpButton: () => null }));
jest.mock('../../../navigation/TabBar', () => ({ useTabBarFootprint: () => 0 }));
jest.mock('../../../lib/revo/presence', () => ({ useRevoFootprint: () => 0 }));
jest.mock('../useInsightsActions', () => ({ useInsightsActions: () => ({ props: {}, toast: null }) }));

// As ConsistencyPage.test: useWindowDimensions reads Dimensions.get (Jest's own is 750 pt wide at text ×2).
let dims: jest.SpyInstance | null = null;
function at(width: number, fontScale: number) {
  dims?.mockRestore();
  dims = jest.spyOn(Dimensions, 'get').mockReturnValue({ width, height: 900, scale: 3, fontScale });
}
afterEach(() => {
  dims?.mockRestore();
  dims = null;
});

const METRICS = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };
const open = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>
        <ActivitySectionScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );

it('[ACT-35] the range chip is in the bar at the default text size, even on an SE', async () => {
  at(375, 1);
  open();
  expect(await screen.findByTestId('section-range')).toBeTruthy();
  expect(screen.queryByTestId('section-range-row')).toBeNull();
});

it('[ACT-35] with the largest text the range chip goes to the top of the page, so the name keeps the bar uncut', async () => {
  at(375, 3.12);
  open();
  expect(await screen.findByTestId('section-range-row')).toBeTruthy();
  expect(screen.getByTestId('section-range')).toBeTruthy();
});
