// components/coach: the old Ask coach (testers only).
export const coach = {
  insights: { coverage: 'Coverage', consistency: 'Consistency', weakSpots: 'Weak spots', pace: 'Pace' },
  /** The Insight's name in lower case, then the fields sent. */
  whatIsSent: 'Only the numbers behind {{insight}} are sent: {{fields}}. Never your notes, recordings, names or page lists.',
  unavailable: 'The coach is unavailable. Try again.',
  title: 'Ask the coach',
  intro: 'The coach answers one question about an Insight, in a sentence or three. It is off until you turn it on.',
  turnOn: 'Turn the coach on',
  /** Before the questions left; the trailing space joins them. */
  kept: 'Kept for today. ',
  left_one: '{{count}} question left today',
  left_other: '{{count}} questions left today',
  ask: 'Ask',
} as const;
