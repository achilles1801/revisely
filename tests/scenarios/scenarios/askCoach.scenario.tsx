// The Ask coach sheet (COACH-4): the consent step first; then only the chosen insight's totals.
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { AskCoachSheet } from '../../../src/components/coach/AskCoachSheet';
import { askCoach, setCoachOptIn } from '../../../src/lib/coach/api';

jest.mock('../../../src/context/ThemeContext', () => ({
  useTheme: () => ({ palette: new Proxy({}, { get: () => '#000000' }), theme: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('../../../src/lib/coach/api', () => ({
  askCoach: jest.fn(async () => ({ answer: 'Keep going.', cached: false, remainingToday: 4 })),
  setCoachOptIn: jest.fn(async () => ({ optIn: true })),
}));
jest.mock('../../../src/components/v2/Sheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { Sheet: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children) };
});

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const totals = {
  memorizedPages: 120,
  revisedWithin7Days: 44,
  revisedWithin30Days: 90,
  daysWithSession30: 20,
  streakDays: 6,
  sessions30: 22,
  weakPages: 3,
  moderatePages: 9,
  strongPages: 100,
  weakRevisedLast7Days: 1,
  pagesPerDay7: 4.3,
  pagesPerDay30: 3.9,
  plannedPerDay: 5,
};

describe('the Ask coach sheet (COACH-4)', () => {
  beforeEach(() => {
    (askCoach as unknown as jest.Mock).mockClear();
    (setCoachOptIn as unknown as jest.Mock).mockClear();
  });

  it('[COACH-4] the consent step comes first, then the chosen insight’s totals only are sent', async () => {
    const screen = render(<AskCoachSheet visible onClose={jest.fn()} day="2026-11-05" totals={totals} />);
    // The first step: nothing is sent until the user turns it on.
    expect(askCoach).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('ask-coach-optin'));
    await flush();
    expect(setCoachOptIn).toHaveBeenCalledWith(true);
    fireEvent.press(screen.getByTestId('ask-coach-pace'));
    fireEvent.press(screen.getByTestId('ask-coach-ask'));
    await flush();
    expect(askCoach).toHaveBeenCalledWith('pace', { pagesPerDay7: 4.3, pagesPerDay30: 3.9, plannedPerDay: 5 }, '2026-11-05');
    expect(screen.getByTestId('ask-coach-answer').props.children).toBe('Keep going.');
  });
});
