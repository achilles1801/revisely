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
} as const;
