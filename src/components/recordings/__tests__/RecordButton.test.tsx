import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { RecordButton } from '../RecordButton';
import { ThemeProvider } from '../../../context/ThemeContext';

const mockIcons: string[] = [];
jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    mockIcons.push(name);
    return null;
  },
}));

const recorder = (phase: string, extra: object = {}) =>
  ({
    phase,
    recording: phase === 'recording',
    paused: phase === 'paused',
    interrupted: false,
    baseMs: 65_000,
    segmentStartedAt: phase === 'recording' ? Date.now() : null,
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    finish: jest.fn(),
    ...extra,
  }) as any;

const renderButton = (r: any) =>
  render(
    <ThemeProvider>
      <RecordButton recorder={r} />
    </ThemeProvider>,
  );

beforeEach(() => (mockIcons.length = 0));

describe('<RecordButton />', () => {
  it('is a mic when idle', async () => {
    const r = recorder('idle');
    renderButton(r);
    fireEvent.press(await screen.findByLabelText('Record your recitation'));
    expect(r.start).toHaveBeenCalled();
  });

  it('while recording: tap the time to pause, the stop square to end — no check mark', async () => {
    const r = recorder('recording');
    renderButton(r);
    fireEvent.press(await screen.findByLabelText(/Pause recording/));
    expect(r.pause).toHaveBeenCalled();
    fireEvent.press(screen.getByLabelText('Stop recording'));
    expect(r.finish).toHaveBeenCalled();
    expect(mockIcons).not.toContain('checkmark');
    expect(screen.queryByLabelText('Finish recording')).toBeNull();
  });

  it('while paused: tap the time to resume', async () => {
    const r = recorder('paused', { interrupted: true });
    renderButton(r);
    const resume = await screen.findByLabelText(/Resume recording, 1:05 recorded/);
    expect(resume.props.accessibilityLabel).toMatch(/interruption/);
    fireEvent.press(resume);
    expect(r.resume).toHaveBeenCalled();
  });
});
