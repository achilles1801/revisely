import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text testID={`icon-${name}`}>{name}</Text> };
});
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  notificationAsync: jest.fn(async () => undefined),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
  NotificationFeedbackType: { Success: 's', Warning: 'w' },
}));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../../context/AppContext', () => ({ useApp: () => ({ user: { id: 'u1', previewTester: true } }) }));
// The sheet's own load is passed in; lib/testScenarios' server call isn't run here.
jest.mock('../../../lib/testScenarios', () => ({
  ...jest.requireActual('../../../lib/testScenarios'),
  loadTestScenario: jest.fn(),
}));

import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { TestScenarioSheet, useSyncHeld } from '../TestScenarioSheet';
import { TEST_SCENARIOS, showsTestScenarios } from '../../../lib/testScenarios';
import { holdSync, releaseSync, resetSyncForTests } from '../../../lib/offline/sync';
import { Text } from 'react-native';

async function open(load: (s: string) => Promise<unknown>, onClose = jest.fn()) {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <TestScenarioSheet visible onClose={onClose} load={load} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
  return onClose;
}

const confirmButton = () => screen.getByTestId('test-scenario-confirm');

beforeEach(async () => {
  jest.clearAllMocks();
  resetSyncForTests();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('@revisely_theme_v2', 'light');
});

describe('Load test scenario (testers)', () => {
  it('lists every scenario; nothing loads until one is picked and RESET typed', async () => {
    const load = jest.fn(async () => ({}));
    await open(load);
    for (const s of TEST_SCENARIOS) expect(screen.getByTestId(`test-scenario-${s.id}`)).toBeTruthy();
    expect(confirmButton().props.accessibilityState).toMatchObject({ disabled: true });

    fireEvent.changeText(screen.getByTestId('test-scenario-input'), 'RESET');
    await act(async () => {
      fireEvent.press(confirmButton());
    });
    expect(load).not.toHaveBeenCalled(); // none picked yet

    fireEvent.press(screen.getByTestId('test-scenario-hafiz'));
    fireEvent.changeText(screen.getByTestId('test-scenario-input'), 'reset');
    await act(async () => {
      fireEvent.press(confirmButton());
    });
    expect(load).not.toHaveBeenCalled(); // not typed as RESET
  });

  it('loads the picked scenario, then closes', async () => {
    const load = jest.fn(async () => ({}));
    const onClose = await open(load);
    fireEvent.press(screen.getByTestId('test-scenario-revise-ahead'));
    fireEvent.changeText(screen.getByTestId('test-scenario-input'), 'RESET');
    expect(screen.getByText('Load Revised ahead')).toBeTruthy();
    await act(async () => {
      fireEvent.press(confirmButton());
    });
    expect(load).toHaveBeenCalledWith('revise-ahead');
    expect(onClose).toHaveBeenCalled();
  });

  it('a refusal shows its reason and the sheet stays', async () => {
    const load = jest.fn(async () => {
      throw new Error('You loaded a test scenario less than 2 minutes ago. Try again in 2 min.');
    });
    const onClose = await open(load);
    fireEvent.press(screen.getByTestId('test-scenario-new'));
    fireEvent.changeText(screen.getByTestId('test-scenario-input'), 'RESET');
    await act(async () => {
      fireEvent.press(confirmButton());
    });
    expect(screen.getByTestId('test-scenario-error').props.children).toMatch(/less than 2 minutes/);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is for previewTester accounts only', () => {
    expect(showsTestScenarios({ previewTester: true })).toBe(true);
    expect(showsTestScenarios({ previewTester: false })).toBe(false);
    expect(showsTestScenarios(null)).toBe(false);
  });
});

describe('held changes (the Offline queue scenario)', () => {
  function Probe() {
    return <Text testID="held">{String(useSyncHeld('u1'))}</Text>;
  }

  it('Settings hears the hold start and end', async () => {
    render(<Probe />);
    expect(screen.getByTestId('held').props.children).toBe('false');
    await act(async () => holdSync('u1'));
    expect(screen.getByTestId('held').props.children).toBe('true');
    await act(async () => releaseSync('u1'));
    expect(screen.getByTestId('held').props.children).toBe('false');
  });
});
