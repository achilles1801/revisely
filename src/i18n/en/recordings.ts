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
} as const;
