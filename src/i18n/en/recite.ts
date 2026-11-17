// lib/recite, components/recite and components/reciteCheck: the speech model, recite mode and the recitation checker.
export const recite = {
  checkPrivacy: 'Your recording goes to Revisely’s server to be checked. Software judges it; nobody listens to it.',
  model: {
    noSpace: 'Free up {{size}} or more on this iPhone, then try again.',
    stopped: 'The download stopped. Check your connection and try again.',
  },
  /** components/recite: the hidden recite mode's panel under the page. */
  panel: {
    hearing: 'Hearing you',
    listening: 'Listening',
    starting: 'Starting…',
    paused: 'Paused · tap the mic',
    micDenied: 'Microphone is off',
    micBusy: 'Microphone busy',
    micOff: 'Mic off',
    startReciting: 'Start reciting',
    following: 'Following',
    couldNotListen: 'Couldn’t listen · tap the mic',
    followWordByWord: 'Follow word by word',
    downloadingModel: 'Downloading the speech model, {{percent}}%',
    wordByWord: 'Word by word',
    /** A download's progress: "42%". */
    percent: '{{percent}}%',
    micAccessOff: 'Microphone access is off',
    micAccessBody: 'Allow Revisely to use the microphone in Settings to show each verse when you pause.',
    showWhenPause: 'Show each verse when you pause',
    showNext: 'Show the next verse',
    nextVerse: 'Next verse',
  },
  /** components/recite/SpeechModelSheet: downloading the speech model. */
  speechModel: {
    intro: 'Revisely can listen as you recite and show each word as you say it.',
    privacy: 'It works on this iPhone: your voice isn’t recorded or sent anywhere.',
    downloading: 'Downloading {{percent}}% of {{size}}. You can close this; it carries on.',
    oneTimeCellular: 'A one-time download of {{size}}. You’re on mobile data.',
    oneTime: 'A one-time download of {{size}}.',
    downloadCellular: 'Download on mobile data',
    download: 'Download {{size}}',
  },
} as const;
