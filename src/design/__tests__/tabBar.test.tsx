import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name, color }: { name: string; color: string }) => <Text testID={`icon-${name}`}>{color}</Text> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
require('react-native-gesture-handler/jestSetup');
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DesignProvider } from '../DesignContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { TabBar } from '../../navigation/TabBar';
import { DEFAULT_ACCENT, paletteLight, paletteV2 } from '../../theme/v2';

const routes = [
  { key: 'home-1', name: 'Home' },
  { key: 'read-1', name: 'Read' },
  { key: 'insights-1', name: 'Insights' },
];

const wrap = (ui: React.ReactElement) => (
  <DesignProvider initial={{}}>
    <ThemeProvider>{ui}</ThemeProvider>
  </DesignProvider>
);

async function setup(
  focusedIndex: number,
  {
    prevent = false,
    onInsightsTabPress = undefined as undefined | (() => void),
    showInsightsTab = true,
    tabBarStyle = undefined as undefined | object,
  } = {},
) {
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
  const navigation = { emit: jest.fn(() => ({ defaultPrevented: prevent })), navigate: jest.fn() };
  const props = {
    state: { index: focusedIndex, routes, key: 'tabs', routeNames: routes.map((r) => r.name) },
    descriptors: Object.fromEntries(routes.map((r) => [r.key, { options: { tabBarStyle } }])),
    navigation,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    showInsightsTab,
    onInsightsTabPress,
  } as any;
  render(wrap(<TabBar {...props} />));
  await act(async () => {});
  return navigation;
}

beforeEach(() => jest.clearAllMocks());

describe('the tab bar', () => {
  it('is a flat, icon-only bar: the selected tab filled in ink, the rest outlined', async () => {
    await setup(0);
    expect(screen.getByTestId('tab-bar-v2')).toBeTruthy();
    expect(screen.getByTestId('icon-home').props.children).toBe(paletteV2(false, DEFAULT_ACCENT).accentText);
    expect(screen.getByTestId('icon-book-outline').props.children).toBe(paletteLight.secondary);
    // Insights is a chart, not sparkles.
    expect(screen.getByTestId('icon-stats-chart-outline')).toBeTruthy();
  });

  it('changes tab without a buzz', async () => {
    const navigation = await setup(0);
    fireEvent.press(screen.getByTestId('tab-Read'));
    expect(navigation.navigate).toHaveBeenCalledWith('Read');
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('can leave Insights out, and hides itself when the screen asks', async () => {
    await setup(0, { showInsightsTab: false });
    expect(screen.queryByTestId('tab-Insights')).toBeNull();
    screen.unmount();
    await setup(0, { tabBarStyle: { display: 'none' } });
    expect(screen.queryByTestId('tab-bar-v2')).toBeNull();
  });
});

describe('tab presses', () => {
  it('re-tapping the focused tab emits tabPress (scroll to top / pop to root) without navigating', async () => {
    const navigation = await setup(1);
    fireEvent.press(screen.getByLabelText('Read'));
    expect(navigation.emit).toHaveBeenCalledWith({ type: 'tabPress', target: 'read-1', canPreventDefault: true });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('tapping another tab emits tabPress and navigates to it', async () => {
    const navigation = await setup(0);
    fireEvent.press(screen.getByLabelText('Read'));
    expect(navigation.emit).toHaveBeenCalledWith(expect.objectContaining({ type: 'tabPress', target: 'read-1' }));
    expect(navigation.navigate).toHaveBeenCalledWith('Read');
  });

  it('does not navigate when a listener prevents the default', async () => {
    const navigation = await setup(0, { prevent: true });
    fireEvent.press(screen.getByLabelText('Read'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('the Insights override replaces tabPress entirely', async () => {
    const onInsightsTabPress = jest.fn();
    const navigation = await setup(0, { onInsightsTabPress });
    fireEvent.press(screen.getByLabelText('Insights'));
    expect(onInsightsTabPress).toHaveBeenCalled();
    expect(navigation.emit).not.toHaveBeenCalled();
  });
});

describe('the tab bar in a real navigator', () => {
  // Required here so the mocks above apply.
  const { NavigationContainer, useScrollToTop } = require('@react-navigation/native');
  const { createPagerTabNavigator } = require('../../navigation/PagerTabs');
  const { createNativeStackNavigator } = require('@react-navigation/native-stack');
  const { Text, Pressable, ScrollView } = require('react-native');

  it('re-tapping Read pops its stack to the first screen, then scrolls it to the top', async () => {
    const Tab = createPagerTabNavigator();
    const Stack = createNativeStackNavigator();
    const scrollTo = jest.fn();

    function Index({ navigation }: any) {
      const ref = React.useRef<any>(null);
      useScrollToTop(ref);
      React.useEffect(() => {
        if (ref.current) ref.current.scrollTo = scrollTo;
      });
      return (
        <ScrollView ref={ref}>
          <Text>Index screen</Text>
          <Pressable onPress={() => navigation.navigate('Detail')}>
            <Text>Open detail</Text>
          </Pressable>
        </ScrollView>
      );
    }
    const Detail = () => <Text>Detail screen</Text>;
    const ReadStack = () => (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Index" component={Index} />
        <Stack.Screen name="Detail" component={Detail} />
      </Stack.Navigator>
    );
    const Home = () => <Text>Home screen</Text>;

    await AsyncStorage.setItem('@revisely_theme_v2', 'light');
    render(
      wrap(
        <NavigationContainer>
          <Tab.Navigator
            initialRouteName="Read"
            tabBar={(props: any) => <TabBar {...props} />}
            swipeableCount={3}
          >
            <Tab.Screen name="Home" component={Home} />
            <Tab.Screen name="Read" component={ReadStack} />
            <Tab.Screen name="Insights" component={Home} />
          </Tab.Navigator>
        </NavigationContainer>,
      ),
    );

    fireEvent.press(await screen.findByText('Open detail'));
    expect(await screen.findByText('Detail screen')).toBeTruthy();

    // Both behaviours run in the next animation frame.
    const nextFrame = () => act(() => new Promise((r) => setTimeout(r, 50)));

    fireEvent.press(screen.getByLabelText('Read'));
    await nextFrame();
    await waitFor(() => expect(screen.queryByText('Detail screen')).toBeNull());

    scrollTo.mockClear();
    fireEvent.press(screen.getByLabelText('Read'));
    await nextFrame();
    expect(scrollTo).toHaveBeenCalledWith({ y: 0, animated: true });
  });
});
