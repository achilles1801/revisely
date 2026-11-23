// The reading timer (context/ReadingTimerContext): its end, and its notification.
export const timer = {
  readingComplete: 'Reading session complete',
  /** The notification when a timed session ends: "20 min logged. Nice work." */
  logged: '{{duration}} logged. Nice work.',
  sessionComplete: 'Session complete',
  saveFailed: "Couldn't save session",
  saved: {
    title: 'Session saved',
    /** "20 min logged. You can add the pages you read in Activity." */
    body: '{{duration}} logged. You can add the pages you read in Activity.',
    addPages: 'Add pages',
  },
  /** The note after a sitting in the reader (REC-1): "Saved to today: Al-Mulk, ayahs 1–26, 41 min · Undo · View". */
  sittingSaved: {
    view: 'View',
    /** Said by VoiceOver as the note appears ({{note}}: "Saved to today: Al-Mulk, ayahs 1–26, 41 min"). */
    announce: '{{note}}. Undo and View are at the bottom of the screen.',
    deleted: 'Sitting deleted',
    deletedWithRecording: 'Sitting and its recording deleted',
    recordingStaysTitle: 'The sitting is deleted',
    recordingStays: 'Part of its recording is backed up already, so it stays. You can delete it from its day in Activity.',
    undoFailed: "Couldn't undo",
    undoRetry: 'Please try again from its day in Activity.',
  },
  card: { close: 'Close timer', closeHint: 'Closes the timer' },
  chip: {
    running: 'Timer running, {{clock}}. Open timer controls',
    paused: 'Timer paused, {{clock}}. Open timer controls',
    open: 'Open timer',
  },
  /** A timer's length: "45 min", "1 h", "1 h 30 min". */
  length: { minutes: '{{m}} min', hours: '{{h}} h', hoursMinutes: '{{h}} h {{m}} min' },
  discard: { title: 'Discard this session?', body: "The time won't be logged.", keepGoing: 'Keep going', discard: 'Discard' },
  caption: {
    paused: 'Paused',
    /** Counting down: "remaining of 30 min"; up: "of 30 min". */
    remainingOf: 'remaining of {{length}}',
    of: 'of {{length}}',
    revised: 'Revised: {{what}}',
    opened: 'Opened: {{what}}',
    savedWhenEnded: 'Saved to Activity when you end it',
    runsUntilEnded: 'Runs until you end it',
    range: '{{min}} to {{max}} minutes',
    typeMinutes: 'Type the minutes',
    endsAndSaves: 'Ends by itself and is saved',
  },
  stopwatch: 'Stopwatch',
  timer: 'Timer',
  minutes: 'Minutes',
  /** VoiceOver's hint for the minutes field: "1 to 480". */
  minutesRange: '{{min}} to {{max}}',
  min: 'min',
  set: 'Set',
  setLength: 'Set the length',
  typeLength: '{{length}}. Type the length',
  shorter: 'Shorter',
  longer: 'Longer',
  down: 'Down',
  up: 'Up',
  discardTimer: 'Discard timer',
  pause: 'Pause',
  resume: 'Resume',
  pauseTimer: 'Pause timer',
  resumeTimer: 'Resume timer',
  end: 'End',
  stopAndSave: 'Stop and save timer',
  start: 'Start',
  startTimer: 'Start timer',
  openQuran: 'Open the Quran',
} as const;
