// Arabic for src/i18n/en/journal.ts. Words and forms: src/i18n/ar-glossary.md.
import type { ArStrings } from './types';

export const journal: NonNullable<ArStrings['journal']> = {
  full: {
    title: 'هذا اليوم ممتلئ',
    body_zero: 'لا يتسع اليوم لمدخلات.',
    body_one: 'يتسع اليوم لمُدخل واحد.',
    body_two: 'يتسع اليوم لمُدخلين.',
    body_few: 'يتسع اليوم حتى {{count}} مُدخلات.',
    body_many: 'يتسع اليوم حتى {{count}} مُدخلًا.',
    body_other: 'يتسع اليوم حتى {{count}} مُدخل.',
  },
  saveFailed: 'تعذّر الحفظ',
  deleteFailed: 'تعذّر الحذف',
  noteDeleted: 'حُذفت الملاحظة',
};
