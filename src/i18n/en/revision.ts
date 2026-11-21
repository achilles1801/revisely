// components/revision, screens/revision and the session pieces in components/ (BulkActionsModal, EditSessionModal, WeaknessRating).
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
    /** After a good moment (SESS-8): the store's review page. The chevron comes from chevron(). */
    rateAsk: 'Enjoying Revisely? Rate it',
    rateAskLabel: 'Rate Revisely',
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
  /** screens/revision: the session itself. */
  session: {
    markedRevised: '{{what}} marked as revised',
    complete_one: 'Revision complete. {{count}} page revised.',
    complete_other: 'Revision complete. {{count}} pages revised.',
    loadFailed: "Couldn't load your session",
    loading: 'Loading…',
    ratePageStrength: 'Rate page strength',
    bulk: 'Jump or mark in bulk',
    help: 'How a session works',
    hidden: 'Hidden',
    /** "From Insights: Al-Mulk". */
    fromInsights: 'From Insights: {{what}}',
    reciteWords: 'Recite: each word shows as you say it',
    pauseToSee: 'Pause after a verse to see it',
    tapToSee: 'Tap a verse to see it',
    /** The header: "Revising ahead · Tue", "Revising Juz 28". */
    revisingAhead: 'Revising ahead · {{day}}',
    revising: 'Revising {{scope}}',
    /** "Al-Mulk 1–12 · Juz 29 · Hizb 57". */
    where: '{{what}} · Juz {{juz}} · Hizb {{hizb}}',
    showPage: 'Show the page',
    hidePage: 'Hide the page',
    micOff: 'Mic off',
    tapHint: 'Tap the page for the controls',
  },
} as const;
