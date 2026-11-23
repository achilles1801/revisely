// lib/recite, components/recite and components/reciteCheck: the speech model (voice search) and the recitation checker.
export const recite = {
  checkPrivacy: 'Your recording goes to Revisely’s server to be checked. Software judges it; nobody listens to it.',
  model: {
    noSpace: 'Free up {{size}} or more on this iPhone, then try again.',
    stopped: 'The download stopped. Check your connection and try again.',
  },
  /** components/recite/SpeechModelSheet: downloading the speech model. */
  speechModel: {
    title: 'Search by voice',
    intro: 'Recite a few words and Revisely finds the ayah.',
    privacy: 'It works on this iPhone: your voice isn’t recorded or sent anywhere.',
    downloading: 'Downloading {{percent}}% of {{size}}. You can close this; it carries on.',
    oneTimeCellular: 'A one-time download of {{size}}. You’re on mobile data.',
    oneTime: 'A one-time download of {{size}}.',
    downloadCellular: 'Download on mobile data',
    download: 'Download {{size}}',
  },
} as const;
