import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { MushafScrubber } from '../MushafScrubber';
import { getReadPalette } from '../../theme/readPalette';

jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn() }));

// Hit area is the track plus 12pt either side; 324 wide → a 300pt track.
const LAYOUT = { nativeEvent: { layout: { x: 0, y: 0, width: 324, height: 32 } } };

function touchHistory(startX: number, currentX: number) {
  const t = {
    touchActive: true,
    startPageX: startX,
    startPageY: 0,
    startTimeStamp: 1,
    currentPageX: currentX,
    currentPageY: 0,
    currentTimeStamp: 2,
    previousPageX: startX,
    previousPageY: 0,
    previousTimeStamp: 1,
  };
  return {
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: 2,
    touchBank: [t],
  };
}

function touch(locationX: number, startX: number, currentX: number) {
  return {
    nativeEvent: {
      locationX,
      locationY: 16,
      pageX: currentX,
      pageY: 0,
      touches: [{}],
      changedTouches: [{}],
      identifier: 0,
      timestamp: 2,
    },
    touchHistory: touchHistory(startX, currentX),
  };
}

function renderScrubber(page = 1) {
  const onJump = jest.fn();
  render(<MushafScrubber page={page} onJump={onJump} palette={getReadPalette(false)} />);
  const track = screen.getByTestId('mushaf-scrubber');
  fireEvent(track, 'layout', LAYOUT);
  return { onJump, track };
}

describe('<MushafScrubber />', () => {
  it('reports the current page to accessibility', () => {
    const { track } = renderScrubber(293);
    expect(track.props.accessibilityValue).toMatchObject({ min: 1, max: 604, now: 293 });
  });

  it('jumps to the tapped spot on release (right end is page 1)', () => {
    const { onJump, track } = renderScrubber(100);
    fireEvent(track, 'responderGrant', touch(12 + 300, 312, 312));
    fireEvent(track, 'responderRelease', touch(12 + 300, 312, 312));
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onJump).toHaveBeenCalledWith(1);
  });

  it('tapping the left end goes to the last page', () => {
    const { onJump, track } = renderScrubber(1);
    fireEvent(track, 'responderGrant', touch(12, 12, 12));
    fireEvent(track, 'responderRelease', touch(12, 12, 12));
    expect(onJump).toHaveBeenCalledWith(604);
  });

  it('previews while dragging and jumps only on release', () => {
    const { onJump, track } = renderScrubber(1);
    fireEvent(track, 'responderGrant', touch(312, 312, 312));
    fireEvent(track, 'responderMove', touch(162, 312, 162)); // dx = -150 → middle
    expect(onJump).not.toHaveBeenCalled();
    expect(screen.getByText('Page 303')).toBeTruthy();
    fireEvent(track, 'responderRelease', touch(162, 312, 162));
    expect(onJump).toHaveBeenCalledWith(303);
    expect(screen.queryByText('Page 303')).toBeNull();
  });

  it('does not jump when the gesture is taken away', () => {
    const { onJump, track } = renderScrubber(1);
    fireEvent(track, 'responderGrant', touch(200, 200, 200));
    fireEvent(track, 'responderTerminate', touch(200, 200, 200));
    expect(onJump).not.toHaveBeenCalled();
  });

  it('steps a page at a time with accessibility actions, within bounds', () => {
    const { onJump, track } = renderScrubber(604);
    fireEvent(track, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onJump).not.toHaveBeenCalled();
    fireEvent(track, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onJump).toHaveBeenCalledWith(603);
  });
});
