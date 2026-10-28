import React from 'react';
import { render, screen } from '@testing-library/react-native';

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
let mockReduceMotion = false;
jest.mock('../../../design/motion', () => ({ useReduceMotion: () => mockReduceMotion }));

import { Confetti, confettiPieces } from '../Confetti';

const COLORS = ['c1', 'c2', 'c3'];

describe('confettiPieces', () => {
  it('the same burst for the same seed, a different one for another', () => {
    expect(confettiPieces(10, COLORS, 3)).toEqual(confettiPieces(10, COLORS, 3));
    expect(confettiPieces(10, COLORS, 4)).not.toEqual(confettiPieces(10, COLORS, 3));
  });

  it('only the colours given, in turn; thrown upwards in a fan, then falling', () => {
    const pieces = confettiPieces(28, COLORS, 1);
    expect(pieces).toHaveLength(28);
    expect(pieces.map((p) => p.color)).toEqual(Array.from({ length: 28 }, (_, i) => COLORS[i % 3]));
    for (const p of pieces) {
      expect(p.dy).toBeLessThan(0);
      expect(p.fall).toBeGreaterThan(0);
      expect(Math.abs(p.dx)).toBeLessThan(300);
    }
    // Both sides of the fan.
    expect(pieces.some((p) => p.dx < 0) && pieces.some((p) => p.dx > 0)).toBe(true);
  });
});

describe('<Confetti />', () => {
  beforeEach(() => {
    mockReduceMotion = false;
  });

  it('nothing until triggered', () => {
    render(<Confetti trigger={0} colors={COLORS} />);
    expect(screen.queryByTestId('confetti')).toBeNull();
  });

  it('a burst that takes no touches and is hidden from VoiceOver', () => {
    render(<Confetti trigger={1} colors={COLORS} count={12} />);
    const burst = screen.getByTestId('confetti', { includeHiddenElements: true });
    expect(burst.props.pointerEvents).toBe('none');
    expect(burst.props.accessibilityElementsHidden).toBe(true);
    expect(burst.children).toHaveLength(12);
  });

  it('nothing with Reduce Motion', () => {
    mockReduceMotion = true;
    render(<Confetti trigger={1} colors={COLORS} />);
    expect(screen.queryByTestId('confetti', { includeHiddenElements: true })).toBeNull();
  });
});
