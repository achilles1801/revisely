// components/memorization and components/MemorizationBrowser: picking memorized pages by surah, juz or hizb.
export const memorization = {
  useThesePages: 'Use these pages',
  /** components/MemorizationBrowser: memorized pages by surah, juz or hizb. */
  browser: {
    pagesInJuz_one: '{{count}} page in juz',
    pagesInJuz_other: '{{count}} pages in juz',
    pagesInHizb_one: '{{count}} page in hizb',
    pagesInHizb_other: '{{count}} pages in hizb',
    hizbN: 'Hizb {{n}}',
    modes: { surahs: 'Surahs', juz: 'Juz', hizb: 'Hizb' },
    doneMarking: 'Done marking',
    markPages: 'Mark memorized pages',
    /** A checkbox: "Al-Baqarah memorized". */
    checkLabel: '{{label}} memorized',
    memorized: 'memorized',
    percentMemorized: '{{percent}}% memorized',
    partly: 'partly memorized',
    notMemorized: 'not memorized',
    tapToMark: 'Tap a page to mark it memorized, or not',
    filled: 'Memorized pages are filled',
    page: 'Page {{page}}',
    pageOpened: 'Page {{page}}, in the entry you opened',
    pageState: 'Page {{page}}, {{state}}',
    pageOpenedState: 'Page {{page}}, in the entry you opened, {{state}}',
  },
  /** screens/main/MemorizationScreen: the memorized pages, and editing them. */
  screen: {
    title: 'Memorization',
    edit: 'Edit memorized pages',
    whenTitle: 'When did you memorize these?',
    marked_one: '{{count}} page marked memorized.',
    marked_other: '{{count}} pages marked memorized.',
    before: "Before (don't log)",
    /** "305 of 604 pages". */
    pagesOf: '{{n}} of 604 pages',
    /** "10.5 of 30 juz · 23 of 114 surahs". */
    juzAndSurahs: '{{juz}} of 30 juz · {{surahs}} of 114 surahs',
    noChanges: 'No changes',
    saveCount: 'Save ({{n}})',
    confirmTitle_one: 'Save {{count}} change?',
    confirmTitle_other: 'Save {{count}} changes?',
    confirmBody: "Your revision schedule follows what's memorized.",
    discard: 'Discard changes',
    reviewTitle: 'Schedule needs review',
    reviewBody: "Your custom schedule doesn't adjust itself. Pages you un-memorized were taken out; new ones aren't scheduled until you add them.",
    review: 'Review schedule',
    later: 'Later',
  },
} as const;
