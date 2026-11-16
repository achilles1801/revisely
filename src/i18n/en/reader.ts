// components/reader: the reader's player bar, its speed menu and the activity chip.
export const reader = {
  player: {
    play: 'Play',
    pause: 'Pause',
    retry: 'Retry',
    stop: 'Stop',
    options: 'Audio options',
    failed: 'Couldn’t play. Check your connection.',
    /** "Speed 1.5×. Change speed". */
    speed: 'Speed {{speed}}. Change speed',
    previous: 'Previous verse',
    next: 'Next verse',
    playFromPage: 'Play from this page',
    /** "Mishary Alafasy. Choose reciter". */
    chooseReciter: '{{reciter}}. Choose reciter',
  },
  speedMenu: {
    close: 'Close speed menu',
    /** VoiceOver's name for a speed: "1.5× speed". */
    option: '{{speed}} speed',
  },
  activity: {
    recording: 'Recording, {{time}}',
    recordingPaused: 'Recording paused, {{time}}',
    /** A verse as "2:255". */
    reciting: 'Reciting {{verse}}',
    recitationPaused: 'Recitation paused {{verse}}',
    timerRunning: 'Timer running, {{clock}}',
    timerPaused: 'Timer paused, {{clock}}',
    /** VoiceOver's name for the chip: what's going on, then this. */
    label: '{{what}}. Show the controls',
  },
} as const;
