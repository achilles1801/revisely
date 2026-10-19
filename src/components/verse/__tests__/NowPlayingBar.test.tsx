import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NowPlayingBar } from '../NowPlayingBar';
import { ThemeProvider } from '../../../context/ThemeContext';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-glass-effect', () => ({ GlassView: require('react-native').View, isLiquidGlassAvailable: () => false }));
jest.mock('expo-blur', () => ({ BlurView: require('react-native').View }));

const base = {
  onPause: jest.fn(),
  onResume: jest.fn(),
  onStop: jest.fn(),
  onPickReciter: jest.fn(),
  voiceName: 'Mahmoud Khalil Al-Husary',
};

const renderBar = (props: Partial<React.ComponentProps<typeof NowPlayingBar>>) =>
  render(
    <ThemeProvider>
      <NowPlayingBar state={{ status: 'playing', verse: { sura: 2, ayah: 57 } }} {...base} {...props} />
    </ThemeProvider>,
  );

describe('<NowPlayingBar />', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows the verse and reciter, and controls playback', async () => {
    const onPrevious = jest.fn();
    const onNext = jest.fn();
    renderBar({ onPrevious, onNext });
    expect(await screen.findByText(/2:57/)).toBeTruthy();
    expect(screen.getByText('Mahmoud Khalil Al-Husary')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Pause'));
    expect(base.onPause).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Previous verse'));
    fireEvent.press(screen.getByLabelText('Next verse'));
    expect(onPrevious).toHaveBeenCalled();
    expect(onNext).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Stop'));
    expect(base.onStop).toHaveBeenCalled();
  });

  it('disables previous / next at the edge of the range', async () => {
    renderBar({});
    expect((await screen.findByLabelText('Previous verse')).props.accessibilityState).toMatchObject({
      disabled: true,
    });
    expect(screen.getByLabelText('Next verse').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('renders nothing when idle', async () => {
    renderBar({ state: { status: 'idle', verse: null } });
    expect(screen.queryByLabelText('Stop')).toBeNull();
  });
});
