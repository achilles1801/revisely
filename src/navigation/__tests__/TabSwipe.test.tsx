import React from 'react';
import { Text } from 'react-native';
import { act, render } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
require('react-native-gesture-handler/jestSetup');

const mockNavigate = jest.fn();
const mockTabNav = { getState: () => ({ type: 'tab' }), navigate: mockNavigate, getParent: () => undefined };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockTabNav }));
const mockApp: { user: { smartTrackingEnabled: boolean } | null } = { user: { smartTrackingEnabled: true } };
jest.mock('../../context/AppContext', () => ({ useApp: () => mockApp }));

import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SWIPE_DISTANCE, SWIPE_VELOCITY, TabName, TabSwipe, swipeTabs, swipeTarget } from '../TabSwipe';

const W = 400;

describe('which tabs a swipe moves through', () => {
  it('Home, Read and Insights; Insights only with Smart Tracking on', () => {
    expect(swipeTabs(true)).toEqual(['Home', 'Read', 'Insights']);
    expect(swipeTabs(false)).toEqual(['Home', 'Read']);
  });
});

describe('where a swipe lands', () => {
  const all = swipeTabs(true);

  it('finger moving left brings the next tab, right the previous one', () => {
    expect(swipeTarget(all, 'Home', -W * 0.4, 0, W)).toBe('Read');
    expect(swipeTarget(all, 'Read', -W * 0.4, 0, W)).toBe('Insights');
    expect(swipeTarget(all, 'Read', W * 0.4, 0, W)).toBe('Home');
    expect(swipeTarget(all, 'Insights', W * 0.4, 0, W)).toBe('Read');
  });

  it('a short, slow swipe stays; a short fling goes', () => {
    expect(swipeTarget(all, 'Home', -W * (SWIPE_DISTANCE - 0.05), 0, W)).toBeNull();
    expect(swipeTarget(all, 'Home', -40, -SWIPE_VELOCITY - 100, W)).toBe('Read');
    // A fling back the other way at the end of a drag doesn't count.
    expect(swipeTarget(all, 'Home', -40, SWIPE_VELOCITY + 100, W)).toBeNull();
  });

  it('nothing beyond either end; without Smart Tracking, Read is the last', () => {
    expect(swipeTarget(all, 'Home', W * 0.5, 0, W)).toBeNull();
    expect(swipeTarget(all, 'Insights', -W * 0.5, 0, W)).toBeNull();
    expect(swipeTarget(swipeTabs(false), 'Read', -W * 0.5, 0, W)).toBeNull();
  });
});

describe('<TabSwipe />', () => {
  beforeEach(() => mockNavigate.mockClear());

  function swipe(tab: TabName, dx: number) {
    render(
      <TabSwipe tab={tab}>
        <Text>screen</Text>
      </TabSwipe>,
    );
    act(() => {
      fireGestureHandler(getByGestureTestId(`tab-swipe-${tab}`), [
        { state: State.BEGAN },
        { state: State.ACTIVE, translationX: Math.sign(dx) * 24 },
        { state: State.ACTIVE, translationX: dx },
        { state: State.END, translationX: dx, velocityX: 0 },
      ]);
    });
  }

  it('a long swipe on Home goes to Read', () => {
    swipe('Home', -300);
    expect(mockNavigate).toHaveBeenCalledWith('Read');
  });

  it('a long swipe right on Insights goes back to Read', () => {
    swipe('Insights', 300);
    expect(mockNavigate).toHaveBeenCalledWith('Read');
  });

  it('a short swipe stays put', () => {
    swipe('Home', -40);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('without Smart Tracking, a swipe left on Read goes nowhere', () => {
    mockApp.user = { smartTrackingEnabled: false };
    swipe('Read', -300);
    expect(mockNavigate).not.toHaveBeenCalled();
    mockApp.user = { smartTrackingEnabled: true };
  });
});
