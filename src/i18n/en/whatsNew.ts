// components/whatsNew: the walkthrough after an update. Its cards' words are lib/help/whatsNew's.
export const whatsNew = {
  title: 'What’s new',
  /** VoiceOver, on each card: "Step 2 of 4. Activity, by blocks". */
  step: 'Step {{step}} of {{total}}. {{title}}',
  next: 'Next',
  /** Card 1's moment in the mistake detection release (ReciteMoment). */
  reciteMoment: {
    skip: 'Skip',
    example: 'Example',
    listening: 'Listening…',
    follows: 'The page follows you',
    marks: 'Each mistake, as you recite',
  },
} as const;
