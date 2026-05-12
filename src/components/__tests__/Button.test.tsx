import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button } from '../Button';
import { ThemeProvider } from '../../context/ThemeContext';

function renderWithTheme(ui: React.ReactElement) {
  return render(<ThemeProvider>{ui}</ThemeProvider>);
}

describe('<Button />', () => {
  it('renders the title', async () => {
    renderWithTheme(<Button title="Continue" onPress={() => {}} />);
    expect(await screen.findByText('Continue')).toBeTruthy();
  });

  it('exposes the title as the default accessibility label', async () => {
    renderWithTheme(<Button title="Save" onPress={() => {}} />);
    expect(await screen.findByRole('button', { name: 'Save' })).toBeTruthy();
  });

  it('uses the provided accessibilityLabel when set', async () => {
    renderWithTheme(
      <Button title="OK" onPress={() => {}} accessibilityLabel="Confirm action" />,
    );
    expect(await screen.findByRole('button', { name: 'Confirm action' })).toBeTruthy();
  });

  it('fires onPress when tapped', async () => {
    const onPress = jest.fn();
    renderWithTheme(<Button title="Tap" onPress={onPress} />);

    fireEvent.press(await screen.findByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    renderWithTheme(<Button title="Tap" onPress={onPress} disabled />);

    fireEvent.press(await screen.findByRole('button'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('reports the disabled state via accessibility', async () => {
    renderWithTheme(<Button title="Tap" onPress={() => {}} disabled />);
    const button = await screen.findByRole('button');
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  });
});
