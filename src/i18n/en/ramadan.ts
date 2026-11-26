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
} as const;
