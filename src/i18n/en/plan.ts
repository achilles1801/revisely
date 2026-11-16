// components/plan: the schedule editor's pieces and the new-plan builder.
export const plan = {
  section: {
    /** VoiceOver: "Saved plans, collapsed". */
    collapsed: '{{title}}, collapsed',
    expanded: '{{title}}, expanded',
    show: 'Shows the section',
    hide: 'Hides the section',
  },
  stepper: { decrease: 'Decrease {{label}}', increase: 'Increase {{label}}' },
  picker: {
    clear: 'Clear search',
    noResults: 'No results for “{{query}}”',
    empty: 'Nothing here yet.',
  },
  days: {
    /** Announced after a drag: "Al-Mulk moved to Tuesday 17 Nov". */
    moved: '{{what}} moved to {{day}}',
    /** A day's VoiceOver name: "Tomorrow: Al-Mulk, 20 pages". */
    label: '{{day}}: {{title}}, {{subtitle}}',
    moveUp: 'Move up',
    moveDown: 'Move down',
    hint: "Double-tap to change what's on this day.",
    deleteDay: 'Delete {{day}}',
  },
  builder: {
    title: 'New plan',
    balanced: 'Balanced',
    byJuz: 'By Juz',
    weakest: 'Weakest',
    balancedFooter:
      'Your memorized pages in order, split into even days that never go over your daily amount. Choose where today starts — it continues from there and wraps around.',
    juzFooter: 'Each day covers whole ajzaʼ you have memorized. Choose which juz is today.',
    weakestFooter: 'Your shakiest and most overdue pages come first, based on your ratings and missed revisions.',
    pagesRange: '{{min}}–{{max}} pages',
    cycle_one: '{{count}}-day cycle · {{perDay}} a day. It starts today and repeats every day.',
    cycle_other: '{{count}}-day cycle · {{perDay}} a day. It starts today and repeats every {{count}} days.',
    longGap: '{{footer}} Gaps longer than about two weeks usually need more reinforcement — consider more pages per day.',
    ofPagesMemorized: '{{have}} of {{total}} pages memorized',
    juzPerDay: 'Juz per day',
    juzPerDayLower: 'juz per day',
    pagesPerDay: 'Pages per day',
    pagesPerDayLower: 'pages per day',
    todayStartsAt: 'Today starts at',
    todayStartsAtLabel: 'Today starts at {{title}}, {{subtitle}}',
    reverse: 'Reverse order',
    reverseOn: 'An-Nas back to Al-Fatiha',
    reverseOff: 'Al-Fatiha to An-Nas',
    preview: 'Preview',
    moreDays_one: '{{count}} more day',
    moreDays_other: '{{count}} more days',
    nothingYet: "Mark pages as memorized first — there's nothing to schedule yet.",
    searchStart: 'Search surahs, ajzaʼ or pages',
    startFooter: 'Revision starts here today and carries on in order, wrapping back around to the beginning.',
  },
} as const;
