// components/home and its feed: Home's Today post, Jump to, the Al-Kahf post and session rows.
export const home = {
  today: {
    memorized: '{{percent}} of the Quran memorized',
    streak: 'Today · {{days}}-day streak',
    /** After where today starts (HOME-3): opens Jump to. */
    change: 'Change',
    /** Home's picture (ACCOUNT-7): opens Account. */
    openAccount: 'Your account',
    adding: 'Adding…',
    addToToday: 'Add to today',
    /** VoiceOver: the catch-up line, then the button. */
    addToTodayLabel: '{{line}}. Add to today',
    editMemorizedLabel: '{{line}}. Edit memorized pages',
    changeHint: 'Opens Jump to, to start today somewhere else',
  },
  jump: {
    title: 'Jump to',
    body: 'Today starts here and the days after follow on. Your plan stays the same.',
    /** With a no-break space, so the number stays with "Juz". */
    juz: 'Juz\u00a0{{n}}',
    juzRange: 'Juz\u00a0{{from}}–{{to}}',
    /** After a juz that's only partly in the schedule: " · 8 of 20 pages". */
    part: ' · {{have}} of {{size}} pages',
    todayStartsHere: 'today starts here',
    /** A row's VoiceOver name: "Juz 12. Al-Baqarah 142 to …", then ". Today starts here" if it is. */
    rowLabel: '{{label}}. {{meta}}',
    rowLabelToday: '{{label}}. {{meta}}. Today starts here',
    pageToday: '{{where}} · today starts here',
    start: 'Start today at {{target}}',
    choose: 'Choose where to start',
  },
  kahf: {
    friday: 'Friday',
    options: 'Al-Kahf options',
    open: 'Open',
    openLabel: 'Open Surah Al-Kahf',
    read: 'Read',
    readLabel: 'Read Surah Al-Kahf',
    markReadLabel: 'Mark Surah Al-Kahf as read',
    /** Read inside the Islamic Friday (Thursday's maghrib to Friday's), Thursday evening included. */
    doneFriday: 'Done for this Friday.',
    /** Friday itself: its pages, and until when (the Islamic Friday ends at Friday's maghrib). */
    itsFriday: 'It’s Friday. {{n}} pages, before maghrib.',
    /** Thursday evening: the Islamic Friday begins at Thursday's maghrib. */
    fridayBegan: 'Friday began at maghrib. {{n}} pages.',
    notToday: 'Not today',
    howLong: 'How long did it take?',
    savedOf: 'Saved as a reading session of Al-Kahf, all {{n}} pages.',
    minutes: '{{m}} minutes',
    usual: 'Usual',
  },
  session: {
    deleteTitle: 'Delete this session?',
    deleteBody: 'This cannot be undone.',
    menuTitle: 'Session',
    edit: 'Edit session',
    delete: 'Delete session',
  },
  /** Today's ayah at the foot of Home (HOME-7). */
  ayah: {
    /** Where it is: "Al-Qamar (54:17)". */
    place: '{{surah}} ({{sura}}:{{ayah}})',
    withSaheeh: '{{place}} · Saheeh International',
    label: 'Today’s ayah, {{place}}',
    hint: 'Opens its page in the mushaf',
  },
  /** screens/main/DashboardScreen: Home itself. */
  screen: {
    loadFailed: "Couldn't load your data",
    saveFailed: "Couldn't save",
    carryFailed: "Couldn't update today's session",
    jumpRefused: "Couldn't start there",
    jumpRefusedBody: "That part isn't in your schedule.",
    /** After Jump to: "Today now starts at Al-Mulk". */
    todayStartsAt: 'Today now starts at {{where}}',
    nextStartsAt: 'Your next revision starts at {{where}}',
    jumpFailed: "Couldn't update your schedule",
    undoFailed: "Couldn't undo",
    /** The Activity tab's name for VoiceOver (TAB-2). */
    activityTab: 'Activity',
    settings: 'Open settings',
    recent: 'Recent sessions',
    noSessions: 'No sessions yet. Start your first revision above.',
  },
} as const;
