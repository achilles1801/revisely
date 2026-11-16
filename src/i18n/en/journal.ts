// screens/journal: a day's log (memorized, revised, notes).
export const journal = {
  /** The composer's kinds. */
  kinds: { memorization: 'Memorized', revision: 'Revised', note: 'Note' },
  placeholder: {
    memorization: 'e.g. Al-Mulk, or pages 562–564',
    revision: 'e.g. Maryam and Taha, or pages 305–321',
    note: 'How did it go? Mistakes to watch, ayat to repeat…',
  },
  discard: {
    title: 'Discard changes?',
    body: "You haven't saved this note.",
    keepEditing: 'Keep editing',
    discard: 'Discard',
  },
  /** What a note can be tagged with: the day's revision, a memorization or a read. */
  tags: { revised: 'Revised', memorized: 'Memorized', read: 'Read', untagged: 'Untagged', label: 'Tag: {{tag}}' },
  checkPages: { title: 'Check the pages', body: 'Type the first and last page, as numbers from 1 to 604.' },
  full: {
    title: 'This day is full',
    body_one: 'A day holds up to {{count}} entry.',
    body_other: 'A day holds up to {{count}} entries.',
  },
  saveFailed: "Couldn't save",
  deleteFailed: "Couldn't delete",
  deleteDay: { title: 'Delete {{day}}?', body: 'This removes every entry for this day.' },
  /** The header's line: "Total 1h 20m". */
  total: 'Total {{minutes}}',
  offline: { title: "Couldn't load this day's log", body: 'Connect to the internet to see and add to it.' },
  options: 'Options',
  newEntry: 'New entry',
  /** The composer while a note is edited. */
  editing: { memorization: 'Editing memorization', revision: 'Editing revision', note: 'Editing note' },
  fillFromSession: 'Fill from your session',
  /** "From your session: Al-Mulk". */
  fromSession: 'From your session: {{text}}',
  fillRead: 'Fill with the pages you read today',
  readNotMemorized: 'Read today, not memorized: {{what}}',
  surahOrJuz: 'Surah or juz',
  fromPage: 'From page',
  toPage: 'To page',
  noteLabel: 'Note',
  whatMemorized: 'What you memorized',
  whatRevised: 'What you revised',
  minutes: 'Minutes',
  add: 'Add',
  saveEntry: 'Save entry',
  addEntry: 'Add entry',
  deleteLog: "Delete this day's log",
  noteDeleted: 'Note deleted',
  /** After the minutes field. */
  min: 'min',
} as const;
