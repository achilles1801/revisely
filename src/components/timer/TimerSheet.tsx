import React from 'react';
import { TimerControls } from './TimerControls';
import { alertSessionSaved } from './sessionSavedAlert';
import { Sheet } from '../v2/Sheet';

interface TimerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** "Open the Quran" in the controls; omitted where the Quran is already open. */
  onOpenQuran?: () => void;
}

/**
 * The timer's controls, in the design's Sheet (a Modal): gorhom bottom sheets
 * render outside ReadingTimerProvider, so useReadingTimer() isn't available in
 * them. Opened by the timer chip in the reader's and the session's controls.
 */
export function TimerSheet({ visible, onClose, onOpenQuran }: TimerSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Timer"
      right={{ label: 'Done', onPress: onClose, strong: true, testID: 'timer-done' }}
      scroll
      testID="timer-sheet"
    >
      <TimerControls
        visible={visible}
        onClose={onClose}
        onSaved={(date, seconds) => alertSessionSaved(date, seconds)}
        onOpenQuran={onOpenQuran}
      />
    </Sheet>
  );
}
