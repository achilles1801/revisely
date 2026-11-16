// components/revision and the session pieces in components/ (BulkActionsModal, EditSessionModal, WeaknessRating).
export const revision = {
  menuTitle: 'Session',
  end: {
    complete: 'Revision complete',
    progress: '{{done}} of {{total}} revised',
    revisedToday_one: '{{count}} page revised today',
    revisedToday_other: '{{count}} pages revised today',
    /** Pages revised ahead, for a later day: "5 pages revised for Tue". */
    revisedFor_one: '{{count}} page revised for {{day}}',
    revisedFor_other: '{{count}} pages revised for {{day}}',
    swipeBack: 'Swipe back for the pages left.',
    nextCycle: 'Next cycle',
    next: 'Next: {{day}}',
    keepGoing: 'Keep going',
    listenBack: 'Listen back',
  },
  /** The sheet that marks a session's pages in bulk. */
  bulk: {
    title: 'Manage pages',
    complete: '{{done}} of {{total}} complete',
    byJuz: 'By juz',
    allPages: 'All pages',
    unmarkAll: 'Unmark all',
    markAllDone: 'Mark all done',
    juzPages: '{{done}} of {{total}} pages',
    juzLabel: 'Juz {{juz}}, {{done}} of {{total}} pages. Mark all done',
    pageLabel: '{{what}}, page {{page}}',
    pageLabelRevised: '{{what}}, page {{page}}, revised',
  },
  /** Editing a past session in the mushaf. */
  edit: {
    deleteTitle: 'Delete session?',
    deleteBody: 'This cannot be undone.',
    closeAndSave: 'Close and save',
    unmarkCurrent: 'Unmark current page',
    markCurrent: 'Mark current page as revised',
    menu: 'Session menu',
    rate: 'Rate strength for this page',
    delete: 'Delete session',
    crumb: 'Juz {{juz}} · Hizb {{hizb}}',
  },
  /** Rating how well a page is known. */
  rating: {
    saveFailed: 'Failed to save rating. Please try again.',
    title: 'Rate this page',
    /** "Al-Mulk 1–12 · p. 562". */
    message: '{{what}} · p. {{page}}',
    wholeJuz: 'Apply to the whole juz',
  },
} as const;
