import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

import { DesignProvider } from '../../design/DesignContext';
import { ThemeProvider } from '../../context/ThemeContext';
import { DOT, TabBar, wormFrame } from '../TabBar';

// Three tabs on a 440pt bar (12pt padding): each tab 138.67pt, centres at
// 81.3, 220 and 358.7.
const BAR = 440;
const tab = (BAR - 24) / 3;
const centre = (i: number) => 12 + (i + 0.5) * tab;

describe('the swipe accent', () => {
  it('at rest, a dot under the tab’s icon', () => {
    for (const i of [0, 1, 2]) {
      const f = wormFrame(i, BAR, 3);
      expect(f.width).toBeCloseTo(DOT);
      expect(f.height).toBeCloseTo(DOT);
      expect(f.left + f.width / 2).toBeCloseTo(centre(i));
    }
  });

  it('mid-swipe, a pill stretched between the two tabs, the front end ahead; a little thinner', () => {
    const f = wormFrame(0.5, BAR, 3);
    expect(f.width).toBeGreaterThan(tab * 0.3);
    expect(f.width).toBeLessThan(tab * 0.6);
    expect(f.height).toBeLessThan(DOT);
    expect(f.height).toBeGreaterThan(DOT * 0.75);
    // Still between the two centres.
    expect(f.left).toBeGreaterThan(centre(0) - DOT);
    expect(f.left + f.width).toBeLessThan(centre(1) + DOT);
  });

  it('follows the finger: the front leads early, the back catches up late', () => {
    const early = wormFrame(0.2, BAR, 3);
    const late = wormFrame(0.8, BAR, 3);
    const frontEarly = early.left + early.width - DOT / 2 - centre(0);
    const backLate = late.left + DOT / 2 - centre(0);
    expect(frontEarly).toBeGreaterThan(tab * 0.2);
    expect(backLate).toBeLessThan(tab * 0.8);
  });

  it('swiping back, the end that leads (the left one) moves first', () => {
    // From the second tab towards the first: just left it (0.9).
    const f = wormFrame(0.9, BAR, 3);
    const leftMoved = centre(1) - (f.left + DOT / 2);
    const rightMoved = centre(1) - (f.left + f.width - DOT / 2);
    expect(leftMoved).toBeGreaterThan(rightMoved * 3);
  });

  it('past either end (the rubber band) it stays a dot on the end tab', () => {
    expect(wormFrame(-0.2, BAR, 3)).toEqual(wormFrame(0, BAR, 3));
    expect(wormFrame(2.3, BAR, 3).left + DOT / 2).toBeCloseTo(centre(2));
    expect(wormFrame(2.3, BAR, 3).width).toBeCloseTo(DOT);
  });

  it('two tabs (Insights hidden)', () => {
    const two = (i: number) => 12 + (i + 0.5) * ((BAR - 24) / 2);
    expect(wormFrame(1, BAR, 2).left + DOT / 2).toBeCloseTo(two(1));
    expect(wormFrame(0, BAR, 2).left + DOT / 2).toBeCloseTo(two(0));
  });
});

describe('the swipe accent in the bar', () => {
  const routes = ['Home', 'Read', 'Insights'].map((name) => ({ key: name, name }));
  const props = {
    state: { index: 0, routes, key: 'tabs', routeNames: routes.map((r) => r.name), type: 'tab', stale: false, history: [] },
    descriptors: Object.fromEntries(routes.map((r) => [r.key, { options: {} }])),
    navigation: { emit: jest.fn(() => ({ defaultPrevented: false })), navigate: jest.fn() },
    position: { value: 0 },
  } as unknown as React.ComponentProps<typeof TabBar>;
  const show = async () => {
    render(
      <DesignProvider initial={{}}>
        <ThemeProvider>
          <TabBar {...props} />
        </ThemeProvider>
      </DesignProvider>,
    );
    await act(async () => {});
  };
  const dots = () => React.Children.count(screen.getByTestId('tab-swipe-accent').props.children);

  it('one dot, which travels', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    await show();
    expect(dots()).toBe(1);
  });

  it('Reduce Motion: a dot per tab, fading from one to the next, none travelling', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    await show();
    expect(dots()).toBe(3);
  });
});
