// screens/preview: the Smart Tracking preview (a demo session, the Insights tab and turning it on).
export const preview = {
  title: 'Smart Tracking',
  close: 'Close preview',
  /** The demo session's header: "Revising Juz 30". */
  revisingJuz: 'Revising Juz {{juz}}',
  /** "An-Naba 1–30 · Juz 30 · Hizb 59". */
  where: '{{what}} · Juz {{juz}} · Hizb {{hizb}}',
  rateHint: 'Tap ⋯, then Rate page strength',
  /** "Rated weak." */
  rated: 'Rated {{rating}}.',
  ratePageStrength: 'Rate page strength',
  showMe: 'Show me',
  rateToContinue: 'Rate the page to continue',
  continue: 'Continue',
  next: 'Next',
  enable: 'Enable',
  gotIt: 'Got it',
  intro: {
    title: 'Meet Smart Tracking',
    body: 'An optional layer that learns your weak spots and shows what to focus on next.',
    rate: "Rate a page after revising it, so the app learns where you're shaky.",
    see: 'See the pages that need your attention most.',
    filter: 'Filter by strength to find weak spots across your memorization.',
  },
  insights: {
    title: 'Insights',
    body: 'This is your Insights tab: where you stand and what to focus on. Tap a page to open it.',
    strength: 'Strength',
    revisedPages_one: '{{count}} revised page',
    revisedPages_other: '{{count}} revised pages',
    focus: 'Focus',
    focusDetail: 'Revise these first: the weakest and most overdue',
    /** Why the page is in Focus: "You marked this as weak". */
    reasonWeak: 'You marked this as {{rating}}',
    reasonRecent: 'Recently rated, keep it fresh',
    /** "Page 582 · An-Naba". */
    rowName: 'Page {{page}} · {{surah}}',
    /** "Weak · You marked this as weak". */
    rowText: '{{rating}} · {{reason}}',
    browse: 'Browse',
    weakestFirst: 'Weakest first',
    tabs: { pages: 'Pages', surahs: 'Surahs', juz: 'Juz' },
    /** "Weak · Juz 30 · just rated". */
    browseText: '{{rating}} · Juz {{juz}} · just rated',
  },
  cta: {
    title: 'Enable Smart Tracking?',
    body: 'Turn it on to rate pages in your revision sessions and see the Insights tab. You can turn it off in Settings any time.',
    rate: 'Rate pages from the session menu while revising.',
    insights: 'The Insights tab shows what to focus on.',
  },
  notNow: {
    title: 'No problem',
    body: 'Turn it on any time: Settings, under Revision.',
    section: 'Revision',
    help: 'Turn on to rate pages from the session menu and see personalized insights.',
  },
} as const;
