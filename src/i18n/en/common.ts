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
  yesterday: 'Yesterday',
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
  /** A count of days: "1 day", "14 days". */
  days_one: '{{count}} day',
  days_other: '{{count}} days',
  juzCount_one: '{{count}} juz',
  juzCount_other: '{{count}} juz',
  tryAgain: 'Try again',
  signOut: 'Sign out',
  /** A progress bar of steps: "Step 2 of 4". */
  stepNOfTotal: 'Step {{n}} of {{total}}',
  error: 'Error',
  save: 'Save',
  ok: 'OK',
  copy: 'Copy',
  loading: 'Loading…',
  /** "Try again." as a sentence after an error. */
  tryAgainSentence: 'Try again.',
  /** A link that opened nowhere (lib/openWebPage): its address follows, with Copy. */
  pageDidNotOpen: 'Couldn’t open the page',
  pageDidNotOpenBody: 'Copy its address to open it in a browser.\n\n{{address}}',
  /** An email address no email app took (Settings → Contact support). */
  emailDidNotOpen: 'Couldn’t open an email app',
  emailDidNotOpenBody: 'Copy our address to write to us from any email app.\n\n{{address}}',
} as const;
