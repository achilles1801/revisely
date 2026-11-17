// components/updates and lib/updates: the update sheets and the forced-update screen.
export const updates = {
  /** The same reassurance under every update prompt. */
  staysAsIs: 'Your plan, progress and recordings stay as they are.',
  ready: {
    title: 'A new update is ready',
    body: 'Revisely restarts to finish updating. It takes a moment.',
    now: 'Update now',
    later: 'Later',
  },
  store: {
    title: 'New version available',
    body: 'Revisely {{version}} is on {{store}}.',
    update: 'Update',
    notNow: 'Not now',
  },
  required: {
    title: 'Update required',
    body:
      'This version of Revisely is no longer supported. Get version {{minimum}} or later from {{store}} to keep ' +
      'revising. Your plan, progress and recordings stay as they are.',
    update: 'Update',
    installed: 'Installed: {{version}}',
  },
  /** Where the store version comes from, inside a sentence: "… is on the App Store." */
  storeName: {
    ios: 'the App Store',
    android: 'Google Play',
  },
} as const;
