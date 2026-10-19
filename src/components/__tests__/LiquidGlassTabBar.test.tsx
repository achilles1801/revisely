import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { LiquidGlassTabBar } from '../LiquidGlassTabBar';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    theme: { accent: '#0a7', textMuted: '#999', textSecondary: '#666' },
  }),
}));

const routes = [
  { key: 'home-1', name: 'Home' },
  { key: 'read-1', name: 'Read' },
  { key: 'insights-1', name: 'Insights' },
];

function setup(focusedIndex: number, { prevent = false, onInsightsTabPress = undefined as undefined | (() => void) } = {}) {
  const navigation = {
    emit: jest.fn(() => ({ defaultPrevented: prevent })),
    navigate: jest.fn(),
  };
  const descriptors = Object.fromEntries(routes.map((r) => [r.key, { options: {} }]));
  const props = {
    state: { index: focusedIndex, routes, key: 'tabs', routeNames: routes.map((r) => r.name) },
    descriptors,
    navigation,
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
    onInsightsTabPress,
  } as any;
  render(<LiquidGlassTabBar {...props} />);
  return navigation;
}

describe('<LiquidGlassTabBar /> tab presses', () => {
  it('re-tapping the focused tab emits tabPress (scroll to top / pop to root) without navigating', () => {
    const navigation = setup(1);
    fireEvent.press(screen.getByLabelText('Read'));
    expect(navigation.emit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'read-1',
      canPreventDefault: true,
    });
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('tapping another tab emits tabPress and navigates to it', () => {
    const navigation = setup(0);
    fireEvent.press(screen.getByLabelText('Read'));
    expect(navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'read-1' }),
    );
    expect(navigation.navigate).toHaveBeenCalledWith('Read');
  });

  it('does not navigate when a listener prevents the default', () => {
    const navigation = setup(0, { prevent: true });
    fireEvent.press(screen.getByLabelText('Read'));
    expect(navigation.navigate).not.toHaveBeenCalled();
  });

  it('the Insights override replaces tabPress entirely', () => {
    const onInsightsTabPress = jest.fn();
    const navigation = setup(0, { onInsightsTabPress });
    fireEvent.press(screen.getByLabelText('Insights'));
    expect(onInsightsTabPress).toHaveBeenCalled();
    expect(navigation.emit).not.toHaveBeenCalled();
  });
});

describe('<LiquidGlassTabBar /> in a real navigator', () => {
  // Required here so the mocks above apply.
  const { NavigationContainer, useScrollToTop } = require('@react-navigation/native');
  const { createBottomTabNavigator } = require('@react-navigation/bottom-tabs');
  const { createNativeStackNavigator } = require('@react-navigation/native-stack');
  const { Text, Pressable, ScrollView } = require('react-native');

  it('re-tapping Read pops its stack to the first screen, then scrolls it to the top', async () => {
    const Tab = createBottomTabNavigator();
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

    render(
      <NavigationContainer>
        <Tab.Navigator
          initialRouteName="Read"
          tabBar={(props: any) => <LiquidGlassTabBar {...props} />}
          screenOptions={{ headerShown: false }}
        >
          <Tab.Screen name="Home" component={Home} />
          <Tab.Screen name="Read" component={ReadStack} />
          <Tab.Screen name="Insights" component={Home} />
        </Tab.Navigator>
      </NavigationContainer>,
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
