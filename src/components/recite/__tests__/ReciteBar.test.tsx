import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../../../context/ThemeContext';
import { formatElapsed, RecitePanel, ReciteStatus, reciteStatusText } from '../ReciteBar';

// The glass background needs the native view.
jest.mock('../../GlassCard', () => ({ GlassCard: () => null }));

const wrap = (ui: React.ReactElement) => render(<ThemeProvider>{ui}</ThemeProvider>);
const verse = (sura: number, ayah: number) => ({ sura, ayah, position: 1, page: 3 }) as any;

describe('the status line', () => {
  it('names the surah, then page, juz, hizb and verse (as Tarteel)', () => {
    expect(reciteStatusText('listening', false, verse(2, 7), 3)).toEqual({
      title: 'Al-Baqarah',
      detail: 'Page 3 · Juz 1 · Hizb 1 · 2:7',
    });
    expect(reciteStatusText('listening', true, null, 379).title).toBe('Start reciting');
    expect(reciteStatusText('listening', true, null, 379).detail).toMatch(/^Page 379 · Juz 19 · Hizb \d+$/);
    expect(reciteStatusText('starting', false, null, 3).title).toBe('Getting ready…');
    expect(reciteStatusText('finishing', false, verse(2, 7), 3).title).toBe('Finishing…');
  });

  it('renders both parts', async () => {
    wrap(<ReciteStatus phase="listening" finding={false} verse={verse(2, 7)} page={3} />);
    expect(await screen.findByText('Al-Baqarah')).toBeTruthy();
    expect(screen.getByText('Page 3 · Juz 1 · Hizb 1 · 2:7')).toBeTruthy();
  });
});

describe('formatElapsed', () => {
  it('reads as a clock', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(10_400)).toBe('0:10');
    expect(formatElapsed(12 * 60_000 + 5_000)).toBe('12:05');
    expect(formatElapsed(3_729_000)).toBe('1:02:09');
  });
});

describe('the panel', () => {
  const props = () => ({
    phase: 'listening' as const,
    finding: false,
    levelDb: () => -30,
    speaking: () => true,
    elapsedMs: () => 10_000,
    lastHeard: 'إني وجدت',
    mistakes: 2,
    perPage: 1.5,
    accuracy: 96,
    hidden: true,
    onToggleHide: jest.fn(),
    onHint: jest.fn(),
    onBack: jest.fn(),
    onStop: jest.fn(),
  });

  it('shows the figures, the time and the last words heard', async () => {
    wrap(<RecitePanel {...props()} />);
    expect(await screen.findByLabelText('2 mistakes')).toBeTruthy();
    expect(screen.getByLabelText('1.5 mistakes a page, 96% accurate')).toBeTruthy();
    expect(screen.getByText('0:10')).toBeTruthy();
    expect(screen.getByText('إني وجدت')).toBeTruthy();
  });

  it('every control does what it says', async () => {
    const p = props();
    wrap(<RecitePanel {...p} />);
    fireEvent.press(await screen.findByLabelText('Show the next word'));
    fireEvent.press(screen.getByLabelText('Back a verse'));
    fireEvent.press(screen.getByLabelText('Stop and see mistakes'));
    fireEvent.press(screen.getByLabelText('Show the words'));
    expect(p.onHint).toHaveBeenCalled();
    expect(p.onBack).toHaveBeenCalled();
    expect(p.onStop).toHaveBeenCalled();
    expect(p.onToggleHide).toHaveBeenCalled();
    // A moment's note of what changed.
    expect(screen.getByText('Hidden verses: off')).toBeTruthy();
  });

  it('turning hiding on says so', async () => {
    wrap(<RecitePanel {...props()} hidden={false} />);
    fireEvent.press(await screen.findByLabelText('Hide the words'));
    expect(screen.getByText('Hidden verses: on')).toBeTruthy();
  });

  it('a hint only while words are hidden and the reciter is found; back only once found', async () => {
    const p = props();
    const { rerender } = wrap(<RecitePanel {...p} hidden={false} />);
    fireEvent.press(await screen.findByLabelText('Show the next word'));
    expect(p.onHint).not.toHaveBeenCalled();
    rerender(
      <ThemeProvider>
        <RecitePanel {...p} finding />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByLabelText('Show the next word'));
    fireEvent.press(screen.getByLabelText('Back a verse'));
    expect(p.onHint).not.toHaveBeenCalled();
    expect(p.onBack).not.toHaveBeenCalled();
  });
});
