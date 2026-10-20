import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../context/ThemeContext';
import { ReciteBar, ReciteStatus, reciteStatusText } from '../ReciteBar';

// The glass background needs the native view.
jest.mock('../../GlassCard', () => ({ GlassCard: () => null }));

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);
const verse = (sura: number, ayah: number) => ({ sura, ayah, position: 1 }) as any;

describe('the status line', () => {
  it('says where the reciter is, in full', () => {
    expect(reciteStatusText('listening', false, verse(2, 7))).toBe('Al-Baqarah · Verse 7');
    expect(reciteStatusText('listening', true, null)).toBe('Listening · start reciting');
    expect(reciteStatusText('starting', false, null)).toBe('Getting ready…');
    expect(reciteStatusText('finishing', false, verse(2, 7))).toBe('Finishing…');
  });

  it('counts mistakes in words, once the reciter is found', async () => {
    wrap(<ReciteStatus phase="listening" finding={false} verse={verse(2, 7)} mistakes={2} />);
    expect(await screen.findByText('Al-Baqarah · Verse 7')).toBeTruthy();
    expect(screen.getByText('2 mistakes')).toBeTruthy();
  });

  it('says so when there are none, and nothing before the reciter is found', async () => {
    const { rerender } = wrap(<ReciteStatus phase="listening" finding={false} verse={verse(2, 7)} mistakes={0} />);
    expect(await screen.findByText('No mistakes')).toBeTruthy();
    rerender(
      <ThemeProvider>
        <ReciteStatus phase="listening" finding verse={null} mistakes={0} />
      </ThemeProvider>,
    );
    expect(screen.queryByText('No mistakes')).toBeNull();
  });
});

describe('the bar', () => {
  const props = {
    phase: 'listening' as const,
    finding: false,
    levelDb: () => -30,
    speaking: () => true,
    hidden: true,
    onToggleHide: jest.fn(),
    onHint: jest.fn(),
    onStop: jest.fn(),
    palette: {} as any,
  };

  it('holds only the controls (the status line has the text)', async () => {
    wrap(<ReciteBar {...props} />);
    await screen.findByLabelText('Stop and see mistakes');
    expect(screen.queryByText(/Verse/)).toBeNull();
    fireEvent.press(screen.getByLabelText('Show the next word'));
    fireEvent.press(screen.getByLabelText('Show the words'));
    fireEvent.press(screen.getByLabelText('Stop and see mistakes'));
    expect(props.onHint).toHaveBeenCalled();
    expect(props.onToggleHide).toHaveBeenCalled();
    expect(props.onStop).toHaveBeenCalled();
  });

  it('offers a hint only while words are hidden and the reciter is found', async () => {
    const { rerender } = wrap(<ReciteBar {...props} hidden={false} />);
    await screen.findByLabelText('Stop and see mistakes');
    expect(screen.queryByLabelText('Show the next word')).toBeNull();
    rerender(
      <ThemeProvider>
        <ReciteBar {...props} finding />
      </ThemeProvider>,
    );
    expect(screen.queryByLabelText('Show the next word')).toBeNull();
  });
});
