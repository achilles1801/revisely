// lib/recite and components/reciteCheck: the speech model and the recitation checker.
export const recite = {
  checkPrivacy: 'Your recording goes to Revisely’s server to be checked. Software judges it; nobody listens to it.',
  model: {
    noSpace: 'Free up {{size}} or more on this iPhone, then try again.',
    stopped: 'The download stopped. Check your connection and try again.',
  },
} as const;
