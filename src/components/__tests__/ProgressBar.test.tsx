import React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { ProgressBar } from '../ProgressBar';
import { ThemeProvider } from '../../context/ThemeContext';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

// ThemeProvider hydrates from AsyncStorage on mount; flush microtasks so the
// children render before we query.
async function flushTheme() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('<ProgressBar />', () => {
  it('renders the rounded percentage when showLabel is true', async () => {
    renderWithTheme(<ProgressBar progress={42.6} showLabel />);
    expect(await screen.findByText('43%')).toBeTruthy();
  });

  it('does not render a label by default', async () => {
    renderWithTheme(<ProgressBar progress={50} />);
    await flushTheme();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('clamps values above 100 in the label', async () => {
    renderWithTheme(<ProgressBar progress={250} showLabel />);
    expect(await screen.findByText('100%')).toBeTruthy();
  });

  it('clamps values below 0 in the label', async () => {
    renderWithTheme(<ProgressBar progress={-25} showLabel />);
    expect(await screen.findByText('0%')).toBeTruthy();
  });
});
