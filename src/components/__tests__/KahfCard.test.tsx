import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { KahfCard } from '../home/KahfCard';
import { ThemeProvider } from '../../context/ThemeContext';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(),
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'l', Medium: 'm', Heavy: 'h' },
}));
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return { GlassView: View, GlassContainer: View, isLiquidGlassAvailable: () => false };
});
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));

function renderCard(state: 'prompt' | 'done' = 'prompt') {
  const props = { onRead: jest.fn(), onMarkRead: jest.fn(), onDismiss: jest.fn() };
  render(
    <ThemeProvider>
      <KahfCard state={state} {...props} />
    </ThemeProvider>,
  );
  return props;
}

describe('<KahfCard />', () => {
  it('suggests Al-Kahf with its pages', async () => {
    renderCard();
    expect(await screen.findByText(/read Surah Al-Kahf/)).toBeTruthy();
    expect(screen.getByText('Pages 293–304')).toBeTruthy();
  });

  it('Read opens the surah, Not today dismisses', async () => {
    const props = renderCard();
    fireEvent.press(await screen.findByLabelText('Read Surah Al-Kahf'));
    expect(props.onRead).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Hide the Al-Kahf reminder for today'));
    expect(props.onDismiss).toHaveBeenCalled();
    expect(props.onMarkRead).not.toHaveBeenCalled();
  });

  it('Mark as read asks for minutes and records the choice', async () => {
    const props = renderCard();
    fireEvent.press(await screen.findByLabelText('Mark Surah Al-Kahf as read'));
    expect(screen.getByText('How long did it take?')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('30 minutes'));
    fireEvent.press(screen.getByLabelText('Save reading session'));
    expect(props.onMarkRead).toHaveBeenCalledWith(30);
  });

  it('saves the default minutes when none is picked, and Cancel records nothing', async () => {
    const props = renderCard();
    fireEvent.press(await screen.findByLabelText('Mark Surah Al-Kahf as read'));
    fireEvent.press(screen.getByText('Cancel'));
    expect(props.onMarkRead).not.toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Mark Surah Al-Kahf as read'));
    fireEvent.press(screen.getByLabelText('Save reading session'));
    expect(props.onMarkRead).toHaveBeenCalledWith(20);
  });

  it('shows Read ✓ once done, with no prompt actions', async () => {
    const props = renderCard('done');
    expect(await screen.findByText('Read ✓')).toBeTruthy();
    expect(screen.queryByLabelText('Mark Surah Al-Kahf as read')).toBeNull();
    fireEvent.press(screen.getByLabelText('Open Surah Al-Kahf'));
    expect(props.onRead).toHaveBeenCalled();
  });
});
