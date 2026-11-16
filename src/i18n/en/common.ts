// Words used the same way in many places: buttons, mostly. A word that means something else
// somewhere ("Done" as a status, not a button) gets its own key in that folder's file.
export const common = {
  back: 'Back',
  cancel: 'Cancel',
  close: 'Close',
  delete: 'Delete',
  done: 'Done',
  more: 'More',
  remove: 'Remove',
  undo: 'Undo',
  /** A count of pages on its own: "1 page", "20 pages". */
  pages_one: '{{count}} page',
  pages_other: '{{count}} pages',
  surah: 'Surah',
  juz: 'Juz',
  surahN: 'Surah {{n}}',
  juzN: 'Juz {{n}}',
  tryAgain: 'Try again',
  signOut: 'Sign out',
} as const;
