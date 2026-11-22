// Arabic for src/i18n/en/coach.ts. Words and forms: src/i18n/ar-glossary.md.
import type { ArStrings } from './types';

export const coach: NonNullable<ArStrings['coach']> = {
  insights: { coverage: 'التغطية', consistency: 'الانتظام', weakSpots: 'مواضع الضعف', pace: 'الوتيرة' },
  whatIsSent: 'لا تُرسَل إلا الأرقام التي وراء {{insight}}: {{fields}}. ولا تُرسَل أبدًا ملاحظاتك أو تسجيلاتك أو أسماؤك أو قوائم صفحاتك.',
  unavailable: 'المدرّب غير متاح. حاول مرة أخرى.',
  title: 'اسأل المدرّب',
  intro: 'يجيب المدرّب عن سؤال واحد عن إحصاء ما، في جملة إلى ثلاث. وهو متوقف حتى تفعّله.',
  turnOn: 'تفعيل المدرّب',
  kept: 'محفوظ لليوم. ',
  left_zero: 'لا أسئلة متبقية اليوم',
  left_one: 'سؤال واحد متبقٍّ اليوم',
  left_two: 'سؤالان متبقيان اليوم',
  left_few: '{{count}} أسئلة متبقية اليوم',
  left_many: '{{count}} سؤالًا متبقيًا اليوم',
  left_other: '{{count}} سؤال متبقٍّ اليوم',
  ask: 'سؤال',
};
