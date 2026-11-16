// Words used the same way in many places: buttons, mostly. A word that means something else
// somewhere ("Done" as a status, not a button) gets its own key in that folder's file.
export const common = {
  back: 'Back',
  cancel: 'Cancel',
  close: 'Close',
  delete: 'Delete',
  done: 'Done',
  more: 'More',
  notNow: 'Not now',
  openSettings: 'Open Settings',
  pleaseTryAgain: 'Please try again.',
  checkConnection: 'Check your connection and try again.',
  remove: 'Remove',
  undo: 'Undo',
  /** A count of pages on its own: "1 page", "20 pages". */
  pages_one: '{{count}} page',
  pages_other: '{{count}} pages',
  surah: 'Surah',
  juz: 'Juz',
  surahN: 'Surah {{n}}',
  juzN: 'Juz {{n}}',
  pageN: 'Page {{n}}',
  /** A page as a quiet detail: "p. 222". */
  pageShort: 'p. {{n}}',
  page: 'Page',
  today: 'Today',
  tomorrow: 'Tomorrow',
  edit: 'Edit',
  search: 'Search',
  apply: 'Apply',
  /** "3 of 20". */
  nOfTotal: '{{n}} of {{total}}',
  saving: 'Saving…',
  /** A size: "142 MB". */
  megabytes: '{{n}} MB',
  /** "Juz 26–27". */
  juzRange: 'Juz {{from}}–{{to}}',
  /** "Juz 3, 7": the numbers already joined. */
  juzList: 'Juz {{list}}',
  juzCount_one: '{{count}} juz',
  juzCount_other: '{{count}} juz',
  tryAgain: 'Try again',
  signOut: 'Sign out',
} as const;
