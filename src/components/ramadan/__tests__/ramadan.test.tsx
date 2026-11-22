// The Ramadan theme's pieces (BEHAVIOUR.md THEME-1; the scenario ramadanTheme covers Home and Settings): its colours
// for every accent, the falling light's and the bulbs' maths, and the tab bar's string lights only in Revisely Dev with
// the switch on.

import React from 'react';
import { act, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const mockVariant = { dev: true };
jest.mock('../../../lib/variant', () => ({ ...jest.requireActual('../../../lib/variant'), isDevVariant: () => mockVariant.dev }));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { TabBar } from '../../../navigation/TabBar';
import {
  __resetRamadanThemeForTests,
  __setRamadanReleasedForTests,
  loadRamadanTheme,
  RAMADAN_THEME_KEY,
  RAMADAN_THEME_RELEASED,
  ramadanThemeOffered,
  ramadanThemeOn,
  setRamadanTheme,
} from '../../../lib/ramadanTheme';
import { ACCENTS, paletteV2, ramadanV2 } from '../../../theme/v2';
import { MOTES, moteOpacity } from '../RamadanSky';
import { bulbBrightness, scallops } from '../StringLights';

const lum = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('the Ramadan theme’s colours', () => {
  it.each(ACCENTS.flatMap((a) => [[a, false], [a, true]] as const))('%s (dark: %s): warm gold that shows on the ground, one bulb in the accent', (accent, dark) => {
    const t = ramadanV2(dark, accent);
    const p = paletteV2(dark, accent);
    for (const c of [t.gold, t.glass, t.flame, t.mote, t.wire, ...t.bulbs]) expect(c).toMatch(/^#[0-9A-F]{6}$/);
    // Decorations, not text: they need only to be seen (the gold) against the ground.
    expect(contrast(t.gold, p.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(t.mote, p.bg)).toBeGreaterThanOrEqual(2.5);
    expect(t.bulbs[1]).toBe(p.doneText);
  });
});

describe('the falling light', () => {
  it('fades in at the top and out before the bottom, never brighter than full', () => {
    expect(moteOpacity(0, 0.3)).toBe(0);
    expect(moteOpacity(1, 0.3)).toBe(0);
    for (let p = 0; p <= 1; p += 0.01) {
      const o = moteOpacity(p, 0.7);
      expect(o).toBeGreaterThanOrEqual(0);
      expect(o).toBeLessThanOrEqual(1);
    }
    // Faint by the last stretch, so it ends with the glow.
    expect(moteOpacity(0.95, 0.5)).toBeLessThan(0.15);
  });

  it('is spread across the screen, the same every time', () => {
    expect(MOTES.length).toBeGreaterThanOrEqual(12);
    const xs = MOTES.map((m) => m.x).sort((a, b) => a - b);
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs[xs.length - 1]).toBeLessThan(1);
    // No gap wider than a fifth of the screen.
    expect(Math.max(...xs.slice(1).map((x, i) => x - xs[i]))).toBeLessThan(0.2);
    expect(MOTES.filter((m) => m.sparkle).length).toBeGreaterThan(0);
  });
});

describe('the string lights', () => {
  it('fit about one scallop per 62 points, at least four', () => {
    expect(scallops(390)).toEqual({ count: 6, span: 65 });
    expect(scallops(200).count).toBe(4);
  });

  it('twinkle but never go out', () => {
    for (let c = 0; c <= 1; c += 0.02) {
      for (let i = 0; i < 7; i++) {
        const b = bulbBrightness(c, i);
        expect(b).toBeGreaterThanOrEqual(0.55);
        expect(b).toBeLessThanOrEqual(1);
      }
    }
  });
});

/** The decorations are hidden from VoiceOver, so queries must look at hidden elements too. */
const HIDDEN = { includeHiddenElements: true };

const routes = [
  { key: 'home-1', name: 'Home' },
  { key: 'read-1', name: 'Read' },
];

async function tabBar() {
  const props = {
    state: { index: 0, routes, key: 'tabs', routeNames: routes.map((r) => r.name) },
    descriptors: Object.fromEntries(routes.map((r) => [r.key, { options: {} }])),
    navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() },
    insets: { top: 0, bottom: 0, left: 0, right: 0 },
  } as any;
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <TabBar {...props} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

describe('[THEME-1] the switch', () => {
  beforeEach(async () => {
    __resetRamadanThemeForTests();
    mockVariant.dev = true;
    await AsyncStorage.clear();
  });

  it('is off until turned on, and is kept on this phone', async () => {
    await loadRamadanTheme();
    expect(ramadanThemeOn()).toBe(false);
    await setRamadanTheme(true);
    expect(await AsyncStorage.getItem(RAMADAN_THEME_KEY)).toBe('1');
    __resetRamadanThemeForTests();
    await loadRamadanTheme();
    expect(ramadanThemeOn()).toBe(true);
  });

  it('is Revisely Dev’s until the release flips RAMADAN_THEME_RELEASED (the release PR changes this line)', () => {
    expect(RAMADAN_THEME_RELEASED).toBe(false);
  });

  it('once released, every app offers it, on unless this phone turned it off', async () => {
    mockVariant.dev = false;
    __setRamadanReleasedForTests(true);
    expect(ramadanThemeOffered()).toBe(true);
    await loadRamadanTheme();
    expect(ramadanThemeOn()).toBe(true);
    await setRamadanTheme(false);
    __resetRamadanThemeForTests();
    __setRamadanReleasedForTests(true);
    await loadRamadanTheme();
    expect(ramadanThemeOn()).toBe(false);
  });

  it('puts string lights on the tab bar in Revisely Dev only, with the switch on', async () => {
    await tabBar();
    expect(screen.queryByTestId('ramadan-lights', HIDDEN)).toBeNull();
    screen.unmount();

    await act(async () => {
      await setRamadanTheme(true);
    });
    await tabBar();
    const lights = screen.getByTestId('ramadan-lights', HIDDEN);
    expect(lights.props.pointerEvents).toBe('none');
    expect(lights.props.accessibilityElementsHidden).toBe(true);
    screen.unmount();

    // The store app: nothing, whatever is stored.
    mockVariant.dev = false;
    await tabBar();
    expect(screen.queryByTestId('ramadan-lights', HIDDEN)).toBeNull();
  });
});
