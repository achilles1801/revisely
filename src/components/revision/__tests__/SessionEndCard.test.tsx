import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { DesignProvider } from '../../../design/DesignContext';
import { ThemeProvider } from '../../../context/ThemeContext';
import { SessionEndCard } from '../SessionEndCard';

jest.mock('@expo/vector-icons', () => {
  const { Text: RNText } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <RNText testID={`icon-${name}`}>{name}</RNText> };
});
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('../../v2/Confetti', () => ({ Confetti: () => null }));

async function show(props: React.ComponentProps<typeof SessionEndCard>) {
  render(
    <DesignProvider initial={{}}>
      <ThemeProvider>
        <SessionEndCard {...props} />
      </ThemeProvider>
    </DesignProvider>,
  );
  await act(async () => {});
}

describe('SessionEndCard: asking for a rating (SESS-8)', () => {
  it('shows the line on a finished session it was given, and the line opens the store', async () => {
    const onRate = jest.fn();
    await show({ total: 3, done: 3, celebrate: 1, onRate });
    expect(screen.getByText(/Enjoying Revisely\? Rate it/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('session-end-rate'));
    expect(onRate).toHaveBeenCalledTimes(1);
  });

  it('has a ✕ that stops asking', async () => {
    const onDismissRate = jest.fn();
    await show({ total: 3, done: 3, celebrate: 1, onRate: jest.fn(), onDismissRate });
    fireEvent.press(screen.getByLabelText("Don't ask again"));
    expect(onDismissRate).toHaveBeenCalledTimes(1);
  });

  it('shows nothing with pages left, or when it is not the moment', async () => {
    await show({ total: 3, done: 2, celebrate: 1, onRate: jest.fn() });
    expect(screen.queryByTestId('session-end-rate')).toBeNull();
    await show({ total: 3, done: 3, celebrate: 1 });
    expect(screen.queryByTestId('session-end-rate')).toBeNull();
  });
});
