// A day's notes in Activity: what the Note sheet and the day say (the old log page is gone, ACT-6).
export const journal = {
  full: {
    title: 'This day is full',
    body_one: 'A day holds up to {{count}} entry.',
    body_other: 'A day holds up to {{count}} entries.',
  },
  saveFailed: "Couldn't save",
  deleteFailed: "Couldn't delete",
  noteDeleted: 'Note deleted',
} as const;
