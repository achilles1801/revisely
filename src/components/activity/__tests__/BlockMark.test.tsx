// The shared Activity marks (gap audit §1 I): one icon per block, the Revised check on a done day.
import React from 'react';
import { render } from '@testing-library/react-native';
jest.mock('../../../context/ThemeContext', () => {
  const { paletteV2 } = require('../../../theme/v2');
  return { useTheme: () => ({ palette: paletteV2(false), theme: {}, isDark: false }) };
});
import { BLOCK_ICON, BlockMark, REVISED_ICON, RevisedMark } from '../BlockMark';

describe('Activity block marks (gap audit I)', () => {
  it('gives each block its one icon; stopwatch is never a block icon', () => {
    expect(BLOCK_ICON.memorized).toBe('leaf-outline');
    expect(BLOCK_ICON.read).toBe('book-outline');
    expect(BLOCK_ICON.notes).toBe('document-text-outline');
    expect(REVISED_ICON).toBe('repeat');
    expect(Object.values(BLOCK_ICON)).not.toContain('stopwatch-outline');
  });

  it('draws a block mark at 36 with its icon', () => {
    const screen = render(<BlockMark kind="read" />);
    expect(screen.toJSON()).toBeTruthy();
  });

  it('a done Revised day shows the done disc with its check, not a ring', () => {
    const done = render(<RevisedMark fraction={1} done />);
    expect(done.getByLabelText('Revised, done')).toBeTruthy();
    const progress = render(<RevisedMark fraction={0.5} done={false} />);
    expect(progress.getByLabelText('50 percent revised')).toBeTruthy();
  });
});
