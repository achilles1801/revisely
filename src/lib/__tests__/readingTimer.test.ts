import {
  completesAt,
  displayMs,
  elapsedMs,
  formatClock,
  formatDuration,
  formatPageRanges,
  formatStopwatch,
  isTimerComplete,
  notePageVisited,
  parsePageRanges,
  pauseTimer,
  remainingMs,
  resumeTimer,
  startTimer,
} from '../readingTimer';

const T0 = 1_000_000;

describe('reading timer state', () => {
  it('stopwatch counts up with no limit', () => {
    const t = startTimer('stopwatch', 3600, '2026-09-29', T0);
    expect(t.targetSeconds).toBeNull();
    expect(elapsedMs(t, T0 + 5 * 3600_000)).toBe(5 * 3600_000);
    expect(remainingMs(t, T0 + 1000)).toBeNull();
    expect(isTimerComplete(t, T0 + 10 * 3600_000)).toBe(false);
  });

  it('excludes paused time', () => {
    let t = startTimer('stopwatch', null, '2026-09-29', T0);
    t = pauseTimer(t, T0 + 60_000);
    expect(elapsedMs(t, T0 + 10 * 60_000)).toBe(60_000);
    t = resumeTimer(t, T0 + 10 * 60_000);
    expect(elapsedMs(t, T0 + 11 * 60_000)).toBe(120_000);
  });

  it('countDown shows remaining time and completes at the target', () => {
    const t = startTimer('countDown', 600, '2026-09-29', T0);
    expect(displayMs(t, T0 + 60_000)).toBe(540_000);
    expect(completesAt(t, T0)).toBe(T0 + 600_000);
    expect(isTimerComplete(t, T0 + 599_000)).toBe(false);
    expect(isTimerComplete(t, T0 + 600_000)).toBe(true);
    // Never records more than the target, even if the app was closed.
    expect(elapsedMs(t, T0 + 3 * 600_000)).toBe(600_000);
  });

  it('countUp shows elapsed time and completes at the target', () => {
    const t = startTimer('countUp', 600, '2026-09-29', T0);
    expect(displayMs(t, T0 + 60_000)).toBe(60_000);
    expect(isTimerComplete(t, T0 + 600_000)).toBe(true);
  });

  it('paused timed sessions have no completion time', () => {
    const t = pauseTimer(startTimer('countDown', 600, '2026-09-29', T0), T0 + 1000);
    expect(completesAt(t, T0 + 5000)).toBeNull();
  });

  it('records each visited page once', () => {
    let t = startTimer('stopwatch', null, '2026-09-29', T0);
    t = notePageVisited(notePageVisited(notePageVisited(t, 45), 46), 45);
    expect(t.pagesVisited).toEqual([45, 46]);
  });
});

describe('formatting', () => {
  it('formats like the iPhone stopwatch', () => {
    expect(formatStopwatch(0)).toBe('00:00,00');
    expect(formatStopwatch(247_320)).toBe('04:07,32');
    expect(formatStopwatch(3_847_320)).toBe('1:04:07,32');
  });

  it('formats compact clocks and durations', () => {
    expect(formatClock(247_900)).toBe('4:07');
    expect(formatClock(3_847_000)).toBe('1:04:07');
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(12 * 60)).toBe('12m');
    expect(formatDuration(65 * 60)).toBe('1h 5m');
    expect(formatDuration(120 * 60)).toBe('2h');
  });
});

describe('page ranges', () => {
  it('parses ranges, singles, and reversed ranges', () => {
    expect(parsePageRanges('45-47, 60')).toEqual([45, 46, 47, 60]);
    expect(parsePageRanges('3–1 2')).toEqual([1, 2, 3]);
    expect(parsePageRanges('')).toEqual([]);
  });

  it('rejects junk and out-of-range pages', () => {
    expect(parsePageRanges('abc')).toBeNull();
    expect(parsePageRanges('600-605')).toBeNull();
    expect(parsePageRanges('0')).toBeNull();
  });

  it('formats pages back into ranges', () => {
    expect(formatPageRanges([60, 45, 46, 47, 46])).toBe('45–47, 60');
    expect(formatPageRanges([])).toBe('');
  });
});
