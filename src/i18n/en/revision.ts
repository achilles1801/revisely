// components/revision, screens/revision and the session pieces in components/ (EditSessionModal, WeaknessRating).
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
    rateAskDismiss: "Don't ask again",
  },
  /** A session's Pages sheet: its pages by number, to go to or mark. */
  pages: {
    title: 'Pages',
    here: 'You are here',
    hereLabel: 'Page {{n}}, you are here',
    goTo: 'Go to page {{n}}',
    mark: 'Mark page {{n}} as revised',
    unmark: 'Unmark page {{n}}',
    markAll: 'Mark all revised',
    unmarkAll: 'Unmark all',
    help: 'Help',
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
    /** Beside the page's number, once it is marked. */
    revised: 'Revised',
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
