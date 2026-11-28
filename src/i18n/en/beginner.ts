// The beginner path (PATH-1, BEGIN-*; Revisely Dev): setup's third answer, the beginner's own setup screen, Home's
// beginner lines and Your surahs. A surah is named with {{surah}} so it follows the app's language (NAME-1).
export const beginner = {
  /** Setup's first question, the third answer (PATH-1). */
  journey: {
    title: 'None yet, or a few surahs',
    detail: 'Start with the short surahs you pray with',
  },
  /** The beginner's second question (BEGIN-1). */
  surahs: {
    title: 'Which surahs do you know?',
    subtitle: 'None yet is fine. Most people start with these.',
    ayahs_one: '{{count}} ayah',
    ayahs_other: '{{count}} ayahs',
    /** A row's VoiceOver name: "Al-Fatihah, 7 ayahs". */
    rowLabel: '{{surah}}, {{ayahs}}',
    chosen_one: '{{count}} surah chosen',
    chosen_other: '{{count}} surahs chosen',
    none: 'None yet? That’s fine. You’ll start with {{surah}}.',
    /** Leads to today's juz grid (and today's path): "juz" is explained where it first appears. */
    byJuz: 'Know a whole juz (one of the Quran’s 30 parts)? Choose by juz',
  },
  /** A beginner's Home (BEGIN-2, BEGIN-3). */
  home: {
    startTitle: 'Start with {{surah}}',
    startBrief: 'Hold an ayah to hear it and see its meaning. Mark it once you know it.',
    startCta: 'Open {{surah}}',
    markLead: 'Know some surahs already?',
    mark: 'Mark them',
    /** After where today goes: "then An-Nas to Al-Kafirun · about 4 min". */
    minutes_one: 'about {{count}} min',
    minutes_other: 'about {{count}} min',
    addLead: 'Learned another surah?',
    add: 'Add it',
  },
  /** Your surahs, from a beginner's Home (BEGIN-5). */
  yours: {
    title: 'Your surahs',
    subtitle: 'Tick the ones you can recite from memory.',
    /** A surah already memorized, read out on its row. */
    known: 'Memorized',
    save_one: 'Save {{count}} surah',
    save_other: 'Save {{count}} surahs',
    saveFailed: 'Couldn’t save',
  },
  /** Today's ayah on a beginner's Home, with its meaning (BEGIN-4). */
  ayah: {
    withSaheeh: '{{place}} · Saheeh International',
  },
} as const;
