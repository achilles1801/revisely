// The Ramadan theme (lib/ramadanDates, lib/ramadanTheme, components/ramadan; BEHAVIOUR.md THEME-1 to THEME-8). The site's
// words, where it has them (docs/assets/strings.js, ramadan.*): "Ramadan Kareem", "Eid Mubarak", "Ramadan in {n} days",
// "Build your Qur’an habit before it begins".
export const ramadan = {
  /** The Hijri date of a day in Ramadan or Eid, on the day card (THEME-6): "12 Ramadan", "1 Shawwal". */
  hijri: {
    ramadan: '{{day}} Ramadan',
    shawwal: '{{day}} Shawwal',
  },
  /** Settings → Testing → Ramadan dates (Revisely Dev): where today falls. */
  test: {
    real: 'The real dates',
    /** "75 days before" Ramadan. */
    before_one: '{{count}} day before',
    before_other: '{{count}} days before',
    day: 'Day {{day}}',
    eid: 'Eid',
    after: 'After Eid',
  },
  /** The session's end card in Ramadan (THEME-7), under the count. */
  endCard: {
    day: 'Day {{day}} of Ramadan',
    eid: 'Eid Mubarak',
  },
  /** Once a Ramadan, on the end card, when every page has been revised or read since 1 Ramadan. */
  khatmah: {
    title: 'You’ve been through the whole Qur’an this Ramadan',
    line: 'All 604 pages since 1 Ramadan',
  },
  /** One card, the first time the theme shows on this phone (THEME-7). */
  intro: {
    kicker: 'What’s new',
    title: 'Ramadan theme',
    /** Shown On. */
    bodyOn: 'Lanterns, falling light and string lights for Ramadan. Turn it off any time in Settings → Appearance.',
    /** Shown by Auto. */
    bodyAuto: 'Lanterns, falling light and string lights while Ramadan lasts. It goes after Eid by itself, or now in Settings → Appearance.',
    done: 'Got it',
  },
  /** Insights' first row in Ramadan (THEME-6): before the month, during it, on Eid. */
  row: {
    title: 'Ramadan',
    eid: 'Eid Mubarak',
    before: 'Build your Qur’an habit before it begins',
    /** After the days to go: "75 days". */
    daysTo_one: 'day',
    daysTo_other: 'days',
    everyDay: 'Day {{day}} · every day so far',
    day: 'Day {{day}} of Ramadan',
    lastTen: 'Day {{day}} · the last ten nights',
    /** After the days revised: "12 of 12 days". */
    ofDays_one: 'of {{count}} day',
    ofDays_other: 'of {{count}} days',
    eidLine: 'Your Ramadan: {{done}} of {{length}} days',
    eidLineKhatmah: 'Your Ramadan: {{done}} of {{length}} days · a khatmah',
    opens: 'Opens Ramadan',
  },
  /** The Ramadan row's own page (THEME-6). */
  page: {
    title: 'Ramadan',
    ayahCite: 'Al-Baqarah, ayah 185',
    /** The big figure: "12 of 12" (days revised of the days so far). */
    ofDays: '{{done}} of {{days}}',
    daysRevised: 'days revised',
    /** "Day 12 · Friday 19 February". */
    sub: 'Day {{day}} · {{date}}',
    lastTen: 'The last ten nights',
    khatmah: 'Khatmah',
    khatmahUnit: 'of 604 pages',
    khatmahLine: 'Pages revised or read since 1 Ramadan',
    revised: 'Revised',
    read: 'Read',
  },
} as const;
