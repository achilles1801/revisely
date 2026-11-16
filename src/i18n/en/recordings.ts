// Recording and playing back recitations (hooks/useVoiceRecorder, hooks/useRecordingPlayback).
export const recordings = {
  inProgress: { title: 'Recording in progress', body: 'Pause the recording to play this one.' },
  downloadFailed: 'Couldn’t download this recording',
  saveFailed: { title: "Couldn't save the recording", body: 'Your device may be out of storage.' },
  already: { title: 'Already recording', body: 'Finish the other recording first.' },
  micOff: {
    title: 'Microphone access is off',
    body: 'Allow Revisely to use the microphone in Settings to record your recitation.',
  },
  startFailed: "Couldn't start recording",
  micBusy: 'The microphone is busy, maybe with a call or another app. Close it and try again.',
  resumeFailed: "Couldn't resume recording",
  button: {
    record: 'Record your recitation',
    saving: 'Saving…',
    /** "Pause recording, 1:05 recorded". */
    pause: 'Pause recording, {{time}} recorded',
    resume: 'Resume recording, {{time}} recorded',
    resumeInterrupted: 'Recording was paused by an interruption. Resume recording, {{time}} recorded',
    stop: 'Stop recording',
  },
  saved: {
    toast: 'Recording saved',
    view: 'View',
    /** Said by VoiceOver as the toast appears. */
    announce: 'Recording saved. Undo and View are at the bottom of the screen.',
    deleted: 'Recording deleted',
    undoFailed: "Couldn't undo",
    undoBackedUp: 'Part of this recording is backed up already. You can delete the recording from its day in Activity.',
    undoRetry: 'Please try again from its day in Activity.',
  },
  kind: { revision: 'Revision', reading: 'Reading' },
  list: {
    deleteTitle: 'Delete this recording?',
    deleteBackedUp: 'It is deleted from this phone and from your backup, and cannot be recovered.',
    deleteLocal: 'It cannot be recovered.',
    none: 'No recordings on this day',
    /** A recording's VoiceOver name: "Revision recording, 9:40 PM". */
    label: '{{kind}} recording, {{time}}',
    labelBackedUp: '{{kind}} recording, {{time}}, backed up',
    labelInBackup: '{{kind}} recording, {{time}}, in your backup',
    deleteRecording: 'Delete recording',
    downloading: 'Downloading recording',
    pause: 'Pause recording',
    play: 'Play recording',
    /** The waveform's value: "0:42 of 3:10". */
    position: '{{at}} of {{total}}',
    listenBack: 'Listen back with the pages',
    inBackup: 'In your backup · downloads when played',
    /** "Play from Al-Baqarah, ayah 142". */
    playFrom: 'Play from {{place}}',
    menuTitle: 'Recording',
  },
} as const;
