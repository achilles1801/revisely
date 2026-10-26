import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import Constants from 'expo-constants';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('../../../modules/install-source', () => ({ __esModule: true, default: null }));

import { DesignProvider, useDesign } from '../DesignContext';
import { makeHaptics } from '../haptics';
import { testerToolsAllowed } from '../../lib/testerTools';
import { ThemeProvider, useTheme } from '../../context/ThemeContext';
import { PressableScale } from '../../components/PressableScale';
import { Greeting } from '../../components/home/Greeting';
import { TodayCard, todayCopy } from '../../components/home/TodayCard';
import { paletteDark, paletteLight } from '../../theme/v2';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('tester tools (the New design switch)', () => {
  const never = () => false;
  it('dev builds, and testers on TestFlight / the preview channel; never the App Store or App Review', () => {
    expect(testerToolsAllowed({ isDev: true, channel: null }, undefined, never)).toBe(true);
    expect(testerToolsAllowed({ isDev: false, channel: 'preview' }, true, never)).toBe(true);
    // A tester's TestFlight install before the channel switch takes effect.
    expect(testerToolsAllowed({ isDev: false, channel: 'production' }, true, () => true)).toBe(true);
    // App Store: production, not TestFlight.
    expect(testerToolsAllowed({ isDev: false, channel: 'production' }, true, never)).toBe(false);
    // App Review (sandbox receipt, preview never reached) and other accounts: not testers.
    expect(testerToolsAllowed({ isDev: false, channel: 'production' }, false, () => true)).toBe(false);
    expect(testerToolsAllowed({ isDev: false, channel: 'preview' }, undefined, () => true)).toBe(false);
  });
});

function Probe() {
  const d = useDesign();
  return (
    <>
      <Text testID="state">{`${d.isNew ? 'new' : 'classic'}|${d.chosen}|${d.allowed}`}</Text>
      <Text onPress={() => d.setChosen('new')}>choose new</Text>
      <Text onPress={() => d.setAllowed(true)}>allow</Text>
    </>
  );
}

describe('DesignContext', () => {
  it('is classic without a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('state').props.children).toBe('classic|classic|false');
  });

  it('shows the new design only where allowed, and keeps the choice on the device', async () => {
    render(
      <DesignProvider>
        <Probe />
      </DesignProvider>,
    );
    await act(async () => {});
    fireEvent.press(screen.getByText('choose new'));
    // Chosen but not allowed (not a tester): still classic.
    expect(screen.getByTestId('state').props.children).toBe('classic|new|false');
    fireEvent.press(screen.getByText('allow'));
    expect(screen.getByTestId('state').props.children).toBe('new|new|true');
    expect(await AsyncStorage.getItem('@revisely_design')).toBe('new');
  });

  it('reads the stored choice before the first frame', async () => {
    await AsyncStorage.setItem('@revisely_design', 'new');
    render(
      <DesignProvider>
        <Probe />
      </DesignProvider>,
    );
    await act(async () => {});
    expect(screen.getByTestId('state').props.children).toBe('classic|new|false');
  });
});

describe('haptics', () => {
  it('in the new design taps don’t buzz; the classic design keeps its taps', () => {
    const tap = (allowed: boolean, chosen: 'new' | 'classic') => {
      render(
        <DesignProvider initial={{ allowed, chosen }}>
          <PressableScale onPress={() => undefined} haptic="light" testID="btn">
            <Text>Go</Text>
          </PressableScale>
        </DesignProvider>,
      );
      fireEvent.press(screen.getByTestId('btn'));
      screen.unmount();
    };
    tap(true, 'new');
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    tap(false, 'new'); // not allowed: classic
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
  });

  it('meaningful haptics follow the Haptics setting', () => {
    makeHaptics(false).success();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    makeHaptics(true).success();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('s');
  });
});

describe('v2 palette', () => {
  const lum = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (a: string, b: string) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  it.each([
    ['light', paletteLight],
    ['dark', paletteDark],
  ])('%s: every text colour reads at 4.5:1 or more on paper and on surface', (_name, p) => {
    for (const ground of [p.paper, p.surface]) {
      for (const ink of [p.ink, p.ink2, p.ink3, p.jade, p.gold, p.danger, p.warning, ...p.strength]) {
        expect(contrast(ink, ground)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(p.onJade, p.jade)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('ThemeContext in the new design', () => {
  function Mode() {
    const { themeMode, isDark, theme } = useTheme();
    return <Text testID="mode">{`${themeMode}|${isDark}|${theme.bg}`}</Text>;
  }
  const renderTheme = async () => {
    render(
      <DesignProvider initial={{ allowed: true, chosen: 'new' }}>
        <ThemeProvider>
          <Mode />
        </ThemeProvider>
      </DesignProvider>,
    );
    await act(async () => {});
    return screen.getByTestId('mode').props.children as string;
  };

  it('this binary pins light mode, so "System" falls back to the classic choice, on the v2 palette', async () => {
    await AsyncStorage.setItem('@revision_buddy_theme', 'dark');
    expect(await renderTheme()).toBe(`dark|true|${paletteDark.paper}`);
  });

  it('once the binary follows the system, System is the default', async () => {
    const config = Constants.expoConfig as { userInterfaceStyle?: string };
    config.userInterfaceStyle = 'automatic';
    try {
      expect((await renderTheme()).startsWith('system|')).toBe(true);
    } finally {
      delete config.userInterfaceStyle;
    }
  });
});

describe('Home in the new design', () => {
  const wrap = (ui: React.ReactElement) => (
    <DesignProvider initial={{ allowed: true, chosen: 'new' }}>
      <ThemeProvider>{ui}</ThemeProvider>
    </DesignProvider>
  );

  it('greets with the salam in Amiri above the name in the display serif', async () => {
    render(wrap(<Greeting name="Karim" date="Monday, October 26" />));
    await act(async () => {});
    expect(screen.getByText('السلام عليكم').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontFamily: 'Amiri-Regular' })]),
    );
    expect(screen.getByTestId('greeting-name').props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ fontFamily: 'Newsreader_500Medium' })]),
    );
    expect(screen.getByText('Monday, October 26')).toBeTruthy();
  });

  it('today is real pages and surahs, never "Juz 27 + 1 more"', () => {
    const pages = Array.from({ length: 20 }, (_, i) => 503 + i);
    expect(todayCopy('not_started', pages, new Set())).toEqual({
      title: 'Pages 503–522',
      detail: 'Al-Ahqaf to Adh-Dhariyat · 20 pages',
      cta: 'Start revision',
    });
    expect(todayCopy('partial', pages, new Set([503, 504])).title).toBe('18 pages to go');
    expect(todayCopy('completed', pages, new Set(pages)).title).toBe('Done for today');
    expect(todayCopy('not_started', [], new Set()).title).toBe('Nothing to revise yet');
  });

  it('page chips fill in as pages are done; one filled action', async () => {
    const onPrimary = jest.fn();
    render(
      wrap(
        <TodayCard
          status="partial"
          pages={[10, 11, 12]}
          done={new Set([10])}
          streak={7}
          onPrimary={onPrimary}
          onEditSchedule={jest.fn()}
          leftovers={0}
          onCarryOver={jest.fn()}
          carrying={false}
          onPushBack={jest.fn()}
          shifting={false}
        />,
      ),
    );
    await act(async () => {});
    expect(screen.getAllByTestId('page-chip-done')).toHaveLength(1);
    expect(screen.getAllByTestId('page-chip')).toHaveLength(2);
    expect(screen.getByLabelText('7-day streak')).toBeTruthy();
    fireEvent.press(screen.getByTestId('today-cta'));
    expect(onPrimary).toHaveBeenCalled();
  });
});
