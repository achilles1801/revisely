// components/revision: a session's end card, its menu and the undo toast.
export const revision = {
  menuTitle: 'Session',
  end: {
    complete: 'Revision complete',
    progress: '{{done}} of {{total}} revised',
    revisedToday_one: '{{count}} page revised today',
    revisedToday_other: '{{count}} pages revised today',
    /** Pages revised ahead, for a later day: "5 pages revised for Tue". */
    revisedFor_one: '{{count}} page revised for {{day}}',
    revisedFor_other: '{{count}} pages revised for {{day}}',
    swipeBack: 'Swipe back for the pages left.',
    nextCycle: 'Next cycle',
    next: 'Next: {{day}}',
    keepGoing: 'Keep going',
    listenBack: 'Listen back',
  },
} as const;
