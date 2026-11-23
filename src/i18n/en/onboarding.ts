// screens/onboarding and components/onboarding: the welcome, then one question a screen.
export const onboarding = {
  welcome: {
    /** "Your Quran, remembered." with "remembered" in the accent, on a new line. */
    title: 'Your Quran,',
    accent: 'remembered',
    body: 'Revise what you have memorized, a little every day.',
    begin: 'Begin',
    note: 'Takes under a minute',
  },
  journey: {
    title: 'How much of the Quran have you memorized?',
    part: 'Part of it',
    partDetail: 'You will pick your juz next',
    all: 'All of it',
    allDetail: 'All 30 juz go into your plan',
  },
  continue: 'Continue',
  juz: {
    title: 'Which juz?',
    subtitle: 'Tap the ones you know.',
    /** What's chosen, as counts: "5 juz chosen", "1 juz and 1 page chosen". */
    chosenJuz_one: '{{count}} juz chosen',
    chosenJuz_other: '{{count}} juz chosen',
    chosenPages_one: '{{count}} page chosen',
    chosenPages_other: '{{count}} pages chosen',
    chosenBoth: '{{juz}} and {{pages}} chosen',
    pagesCount_one: '{{count}} page',
    pagesCount_other: '{{count}} pages',
    none: 'Nothing chosen yet',
    bySurah: 'Choose by surah instead',
    bySurahTitle: 'Choose by surah',
    loading: 'Loading your pages…',
  },
  amount: {
    title: 'How much can you revise a day?',
    subtitle: 'Start small. You can change it any time.',
    pages: 'Pages',
    /** Under the number. */
    pagesADay_one: 'page a day',
    pagesADay_other: 'pages a day',
    juzADay_one: 'juz a day',
    juzADay_other: 'ajzaʼ a day',
    /** What the minus and plus change, for VoiceOver. */
    pagesLabel: 'Pages a day',
    juzLabel: 'Juz a day',
    round_one: 'A full round every day',
    round_other: 'A full round every {{count}} days',
  },
  dayStart: {
    title: 'When does your day start?',
    fajr: 'At Fajr',
    fajrDetail: 'A new day begins at dawn, from your location',
    midnight: 'At midnight',
    midnightDetail: 'A new day begins at 12:00',
    noLocationTitle: 'Location not available',
    noLocationBody: "Without location we can't compute fajr. Defaulting to midnight — switch in Settings once you grant location.",
  },
  reminder: {
    title: 'Want a daily reminder?',
    subtitle: 'One nudge a day, so revision stays steady.',
    on: 'Remind me',
    off: 'Not now',
    /** The sample notification. */
    appName: 'Revisely',
    now: 'now',
    previewLabel: 'A sample reminder: {{text}}',
  },
  /** Revisely Dev's Preview onboarding (ONBOARD-5). */
  preview: {
    close: 'Close preview',
  },
} as const;
