// components/revo: Revo, the assistant (its sheet, chat, pages, the + sheet and its charts).
export const revo = {
  revo: 'Revo',
  meet: 'Meet Revo',
  history: 'History',
  memory: 'Memory',
  /** A page's rating band, in a sentence or a legend: "weak", "moderate", "strong". */
  bands: {
    weak: 'weak',
    moderate: 'moderate',
    strong: 'strong',
  },
  /** The + sheet: adding surahs, juz, days or pages to a question. */
  add: {
    surahs: 'Surahs',
    days: 'Days',
    pages: 'Pages',
    ayahs: 'Ayahs',
    title: 'Add to chat',
    addN: 'Add {{n}}',
    add: 'Add',
    search: 'Surah, juz, day or page',
    searchLabel: 'Search a surah, juz, day or page',
    clearSearch: 'Clear the search',
    nothingFound: 'Nothing found. Try a surah, “Juz 14”, “Tuesday” or “p. 288”.',
  },
  broken: {
    title: 'Revo ran into a problem',
    body: 'Close it and open it again. Your conversations are kept.',
  },
  button: {
    newReview: 'Revo, a new Day in review',
    hint: 'Ask about your revision',
  },
  /** The card under an answer with the one thing Revo suggests. */
  card: {
    reviseFirst: 'Add to my plan',
    openPage: 'Open in the reader',
    startRevision: 'Start revision',
    added: 'Added to tomorrow’s revision',
  },
  chat: {
    resting: 'Revo is resting',
    capped: 'Revo has reached this month’s limit for everyone. It’s back next month. Your conversations stay in History.',
    /** The server's reason, then this. */
    restingBody: '{{message}} Your conversations stay in History.',
    dailyTitle: 'That’s today’s {{n}} questions',
    /** When questions are back ("Back after Fajr."), then this. */
    dailyBody: '{{back}} Your conversations stay in History.',
    backNextMonth: 'Back next month',
    backLater: 'Back later',
  },
  composer: {
    placeholder: 'Ask Revo anything',
    send: 'Send',
    dictate: 'Dictate with the keyboard',
  },
  /** Adding a day from the month in the + sheet. */
  month: {
    revised: 'Revised',
    passages: 'Passages',
    ratings: 'Ratings',
    memorized: 'Memorized',
    read: 'Read',
    notes: 'Notes',
    /** Pages of the day's plan revised: "12 of 20". */
    ofPlan: '{{done}} of {{total}}',
    pagesN: '{{n}} pages',
    /** "12 of 20 · 35 min". */
    withMinutes: '{{value}} · {{minutes}} min',
    nothingRevised: 'Nothing revised',
    weak: '{{n}} weak',
    moderate: '{{n}} moderate',
    strong: '{{n}} strong',
    memorizedPages_one: '+{{count}} page',
    memorizedPages_other: '+{{count}} pages',
    minutes: '{{n}} min',
    notesSent: '{{n}}, sent with the day',
    previous: 'Previous month',
    next: 'Next month',
    removeDay: 'Remove this day',
    addThisDay: 'Add this day',
    added: 'Added',
    addDay: 'Add day',
    /** VoiceOver on a day: "Monday 9 November, revised 60 percent, added". */
    revisedPercent: 'revised {{percent}} percent',
    addedLower: 'added',
  },
  /** Adding pages from a juz in the + sheet. */
  grid: {
    juzChoose: 'Juz {{n}}, choose another',
    pageChosen: 'Page {{n}}, chosen',
    added: 'Added',
    addPages: 'Add these pages',
  },
  historyPage: {
    newChat: 'New conversation',
    search: 'Search conversations',
    noMatch: 'No conversations match.',
    empty: 'Your conversations with Revo will be here.',
  },
  memoryPage: {
    fromActivity: 'From your Activity',
    fromChatToday: 'From a chat today',
    /** "From a chat on 9 Nov". */
    fromChatOn: 'From a chat on {{date}}',
    clearTitle: 'Clear Revo’s memory?',
    clearBody: 'Everything Revo remembers is deleted. Your conversations stay.',
    clear: 'Clear',
    letRemember: 'Let Revo remember',
    letRememberSub: 'Short notes from your chats, so answers fit you',
    remembers: 'What Revo remembers',
    empty: 'Nothing yet. Revo keeps a short note when something in a chat will help later.',
    /** VoiceOver on a memory's bin: "Delete: Revises after Fajr". */
    deleteItem: 'Delete: {{text}}',
    clearAll: 'Clear Revo’s memory',
  },
  /** Turning Revo on (REVO-21): every line true to what the server sends. */
  optIn: {
    bodySmart: 'Your revision coach. Ask about your progress, your weak spots or your plan, and get answers from your own Revisely data.',
    body: 'Your revision coach. Ask about your progress or your plan, and get answers from your own Revisely data.',
    totals: 'Uses your totals',
    totalsLineSmart: 'Coverage, consistency, weak spots and pace.',
    totalsLine: 'Coverage, consistency and pace.',
    claude: 'Answered by Claude, from Anthropic',
    claudeLine: 'Your questions, the chat so far and the totals Revo needs go to Anthropic to write each answer. Anthropic doesn’t train its models on them.',
    private: 'Your notes and recordings stay private',
    privateLine: 'A day’s notes go only when you add that day to a question. Revo never gets your audio.',
    off: 'Off any time',
    offLine: 'Settings → Revo AI. Your history can be deleted there too.',
    turnOn: 'Turn on Revo',
    mistakes: 'Revo AI can make mistakes.',
    howData: 'How your data is used',
  },
  parts: {
    good: 'Good answer',
    bad: 'Bad answer',
    /** An attachment's chip: "Remove Al-Mulk". */
    remove: 'Remove {{label}}',
    /** VoiceOver on a suggestion: "Ask: How was my week?". */
    ask: 'Ask: {{chip}}',
    review: 'Day in review',
    reviewAt: 'Day in review, {{time}}',
    thinking: 'Revo is thinking',
  },
  sheet: {
    closeRevo: 'Close Revo',
    closeExpand: 'Close. Swipe up to expand',
    expand: 'Expand',
  },
  /** Charts in Revo's answers. */
  chart: {
    firstTomorrow: 'First in tomorrow’s revision',
    reviseFirst: 'Revise first tomorrow',
    openActivity: 'Open in Activity',
    /** VoiceOver on a day's bar: "9 Nov: 20 pages of 24 planned". */
    daySpoken: '{{date}}: {{pages}}',
    daySpokenPlanned: '{{date}}: {{pages}} of {{planned}} planned',
    dailyHint: '{{pages}} · tap a day to see it',
    plannedNotRevised: 'Planned, not revised',
    pickDay: 'Swipe up or down to pick a day',
    revised: 'Revised',
    planned: 'Planned',
    juzHint: 'Tap a juz to see it',
    pickJuz: 'Swipe up or down to pick a juz',
    memorizedFailed: 'Couldn’t load your memorization',
    memorizedHint: '{{pages}} in {{months}} months · tap a month to see it',
    pickMonth: 'Swipe up or down to pick a month',
    /** A rating on a day: "weak on 9 Nov". */
    bandOn: '{{band}} on {{date}}',
    noRatings: 'no ratings',
    rowHint: 'Tap a row to see it',
    pickRow: 'Swipe up or down to pick a row',
    sortedBy: 'Sorted by {{column}} · tap a row to see it',
    tableHint: 'Tap a heading to sort, a row to see it',
    sortBy: 'Sort by {{column}}',
    pickRevision: 'Swipe up or down to pick a revision',
    notRated: 'not rated',
    done: 'Done',
    part: 'Part',
    missed: 'Missed',
    noPlan: 'No plan',
  },
} as const;
