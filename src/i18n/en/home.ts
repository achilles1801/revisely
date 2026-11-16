// components/home and its feed: Home's Today post, Jump to, the Al-Kahf post and session rows.
export const home = {
  today: {
    memorized: '{{percent}} of the Quran memorized',
    streak: 'Today · {{days}}-day streak',
    jump: 'Jump to…',
    jumpSubtitle: 'Start today at another juz, surah or page',
    editSchedule: 'Edit schedule',
    adding: 'Adding…',
    addToToday: 'Add to today',
    /** VoiceOver: the catch-up line, then the button. */
    addToTodayLabel: '{{line}}. Add to today',
    editMemorizedLabel: '{{line}}. Edit memorized pages',
    summaryHint: 'Jump to another start, or edit the schedule',
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
    markRead: 'Mark as read',
    markReadLabel: 'Mark Surah Al-Kahf as read',
    readToday: 'Read today.',
    itsFriday: "It's Friday. Read Surah Al-Kahf.",
    /** Its pages: "pages 293–304". */
    range: 'pages {{from}}–{{to}}',
    saved: 'Saved as a reading session, {{range}}.',
    whole: 'The whole surah, {{range}}.',
    notToday: 'Not today',
    howLong: 'How long did it take?',
    savedOf: 'Saved as a reading session of Al-Kahf ({{range}}).',
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
} as const;
