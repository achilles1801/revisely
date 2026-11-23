import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../context/ThemeContext';
import { CheckerModelRow } from '../CheckerModelRow';
import type { CheckerModels } from '../../../lib/reciteCheck/checkerModel';

jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

const V7: CheckerModels = { recite: 'v7', harakat: 'v7', strict: 'released+v5', server: 'a5b8def6' };

async function show(read: () => Promise<CheckerModels | null>) {
  render(
    <ThemeProvider>
      <CheckerModelRow read={read} />
    </ThemeProvider>,
  );
  await act(async () => {});
}

describe("Revisely Dev's Settings → Testing: the checker's model", () => {
  it('names each level’s model in the app’s words, and the checker’s commit quietly', async () => {
    await show(async () => V7);
    expect(screen.getByText('Mistake detection model')).toBeTruthy();
    expect(screen.getByText('Recite v7 · Mistakes v7 · Strict v5')).toBeTruthy();
    expect(screen.getByText('Checker a5b8def6')).toBeTruthy();
    expect(screen.getByLabelText('Mistake detection model, Recite v7 · Mistakes v7 · Strict v5, Checker a5b8def6')).toBeTruthy();
  });

  it('production’s models read the same way', async () => {
    await show(async () => ({ recite: 'v6', harakat: 'v6', strict: 'released+v5' }));
    expect(screen.getByText('Recite v6 · Mistakes v6 · Strict v5')).toBeTruthy();
    expect(screen.queryByText(/^Checker /)).toBeNull();
  });

  it('while it asks, it says so', async () => {
    render(
      <ThemeProvider>
        <CheckerModelRow read={() => new Promise(() => undefined)} />
      </ThemeProvider>,
    );
    await act(async () => {});
    expect(screen.getByText('Asking the checker…')).toBeTruthy();
  });

  it('unreachable: says so and shows no model; a tap asks again', async () => {
    const read = jest.fn<Promise<CheckerModels | null>, []>(async () => null);
    await show(read);
    expect(screen.getByText('Couldn’t reach the checker. Tap to try again.')).toBeTruthy();
    expect(screen.queryByText(/Recite v/)).toBeNull();

    read.mockResolvedValueOnce(V7);
    fireEvent.press(screen.getByTestId('settings-checker-model'));
    await act(async () => {});
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Recite v7 · Mistakes v7 · Strict v5')).toBeTruthy();
  });

  it('asks once when Settings opens, and not again while an answer is on its way', async () => {
    let answer: (m: CheckerModels | null) => void = () => undefined;
    const read = jest.fn(() => new Promise<CheckerModels | null>((resolve) => (answer = resolve)));
    render(
      <ThemeProvider>
        <CheckerModelRow read={read} />
      </ThemeProvider>,
    );
    await act(async () => {});
    fireEvent.press(screen.getByTestId('settings-checker-model'));
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => answer(V7));
    expect(screen.getByText('Recite v7 · Mistakes v7 · Strict v5')).toBeTruthy();
  });
});
