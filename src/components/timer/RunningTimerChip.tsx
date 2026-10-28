import React from 'react';
import { useReadingTimer } from '../../context/ReadingTimerContext';
import { TimerChip } from './TimerChip';

/**
 * The new design has no floating timer button: a timer starts from the reader
 * or the revision session. While one runs (or is paused), this shows its clock
 * in Home's top bar, so it's never out of sight; it opens the same controls.
 */
export function RunningTimerChip({ onOpenQuran }: { onOpenQuran?: () => void }) {
  const { timer } = useReadingTimer();
  if (!timer) return null;
  return <TimerChip onOpenQuran={onOpenQuran} compact />;
}
