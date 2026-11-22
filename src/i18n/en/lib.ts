// lib's own files: how the app names parts of the Qur'an (passages, page ranges), the plan's day, recency, ratings.
export const lib = {
  /** lib/passages. No-break spaces ( ) keep "Juz 28" and "ayah 142" together. */
  passages: {
    /** "Juz 28". Every phrase that names a juz holds this one's words: a passage already naming one gets no "· Juz". */
    juz: 'Juz {{n}}',
    juzRange: 'Juz {{from}}–{{to}}',
    startOf: 'the start of {{surah}}',
    endOf: 'the end of {{surah}}',
    /** "Al-Mulk 1–12", "Al-Mulk 12". */
    surahAyahs: '{{surah}} {{from}}–{{to}}',
    surahAyah: '{{surah}} {{ayah}}',
    /** "Al-Baqarah, ayah 142", "Al-Baqarah, ayahs 142–176". */
    surahAyahLong: '{{surah}}, ayah {{ayah}}',
    surahAyahsLong: '{{surah}}, ayahs {{from}}–{{to}}',
    fromTo: '{{from}} to {{to}}',
    endOfJuz: 'the end of Juz {{n}}',
    listAnd: '{{list}} and {{last}}',
    listSeparator: ', ',
    thenSeparator: ', then ',
    more_one: '{{count}} more',
    more_other: '{{count}} more',
    withJuz: '{{text}} · {{juz}}',
    wholeSurah: 'Whole surah',
    /** A surah's row: "Ayah 286", "Ayahs 1–5, 20–30". */
    ayahOne: 'Ayah {{list}}',
    ayahsMany: 'Ayahs {{list}}',
  },
  /** lib/pageRanges: "Page 5", "Pages 1–3, 7 and 20–22". */
  pageRanges: {
    page: 'Page {{list}}',
    pages: 'Pages {{list}}',
    andMoreRanges: '{{list}} and {{count}} more ranges',
    juz: 'Juz {{n}}',
    juzRange: 'Juz {{from}}–{{to}}',
  },
  /** lib/planDisplay: a plan's day. */
  plan: {
    pagesShort: 'p. {{list}}',
    pagesShortMore: 'p. {{list}} +{{count}} more',
    juz: 'Juz {{n}}',
    juzRange: 'Juz {{from}}–{{to}}',
    juzList: 'Juz {{list}}',
    pages_one: '{{count}} page',
    pages_other: '{{count}} pages',
    restDay: 'Rest Day',
    nothingScheduled: 'Nothing scheduled',
    beginning: 'Beginning',
    startDetail: 'Juz {{juz}} · p. {{page}}',
    /** What the Schedule screen calls a custom plan without a name (SCHED-7). */
    customPlan: 'Custom plan',
    tomorrow: 'Tomorrow',
    nextCycle: 'Next cycle',
    /** Jump to's start: "Juz 18", "Juz 18 · Al-Kahf, ayah 75". */
    jumpJuz: 'Juz {{n}}',
    jumpJuzAt: 'Juz {{n}} · {{place}}',
  },
  /** lib/recency. */
  recency: {
    once: 'once',
    twice: 'twice',
    times_one: '{{count}} times',
    times_other: '{{count}} times',
    never: 'Never revised',
    today: 'Last revised today',
    yesterday: 'Last revised yesterday',
    daysAgo_one: 'Last revised {{count}} day ago',
    daysAgo_other: 'Last revised {{count}} days ago',
    inDays: '{{times}} in {{days}} days',
    notInDays: 'not in the last {{days}} days',
    line: '{{last}} · {{often}}',
  },
  /** lib/ratings: how strong a page is (Smart Tracking). */
  ratings: {
    veryWeak: 'Very weak',
    weak: 'Weak',
    moderate: 'Moderate',
    strong: 'Strong',
    veryStrong: 'Very strong',
    notRated: 'Not rated',
  },
  /** lib/dayAgo: a list's short dates. */
  dayAgo: {
    today: 'Today',
    yesterday: 'Yesterday',
    /** "3d", "2w". */
    days: '{{n}}d',
    weeks: '{{n}}w',
  },
} as const;
