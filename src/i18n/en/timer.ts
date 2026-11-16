// The reading timer (context/ReadingTimerContext): its end, and its notification.
export const timer = {
  readingComplete: 'Reading session complete',
  /** The notification when a timed session ends: "20 min logged. Nice work." */
  logged: '{{duration}} logged. Nice work.',
  sessionComplete: 'Session complete',
  saveFailed: "Couldn't save session",
} as const;
