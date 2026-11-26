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
} as const;
