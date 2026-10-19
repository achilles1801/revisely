import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { Greeting } from '../home/Greeting';

jest.mock('../../context/ThemeContext', () => ({
  useTheme: () => ({ theme: { textPrimary: '#111' } }),
}));

describe('<Greeting />', () => {
  it('renders a 60-character name in full, allowed two lines and to shrink', () => {
    const long = 'Muhammadabdulrahmanibnabdullahalqurashialhashimialmakkiyy60c';
    expect(long).toHaveLength(60);
    render(<Greeting name={long} />);
    const name = screen.getByTestId('greeting-name');
    expect(name.props.children).toBe(long);
    expect(name.props.numberOfLines).toBe(2);
    expect(name.props.adjustsFontSizeToFit).toBe(true);
    expect(name.props.minimumFontScale).toBeGreaterThanOrEqual(0.6);
    expect(StyleSheet.flatten(name.props.style).flexShrink).toBe(1);
  });

  it('lets the salam wrap below the name rather than squeezing it', () => {
    render(<Greeting name="Majd" />);
    const row = screen.getByTestId('greeting-name').parent?.parent;
    expect(StyleSheet.flatten(row?.props.style).flexWrap).toBe('wrap');
    expect(screen.getByText('السلام عليكم')).toBeTruthy();
  });

  it('renders an Arabic name', () => {
    render(<Greeting name="عبد الرحمن" />);
    expect(screen.getByText('عبد الرحمن')).toBeTruthy();
  });

  it('shows only the salam without a name', () => {
    render(<Greeting name="" />);
    expect(screen.queryByTestId('greeting-name')).toBeNull();
    expect(screen.getByText('السلام عليكم')).toBeTruthy();
  });
});
