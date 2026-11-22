// Arabic for src/i18n/en/offline.ts. Words and forms: src/i18n/ar-glossary.md.
import type { ArStrings } from './types';

export const offline: NonNullable<ArStrings['offline']> = {
  setUp: {
    title: 'اتصل بالإنترنت لإكمال الإعداد',
    body: 'يحتاج ريفايزلي إلى الاتصال مرة واحدة لتحميل حسابك على هذا الهاتف. وبعدها يعمل دون اتصال.',
  },
  note: {
    short: 'دون اتصال',
    waiting: 'دون اتصال · التغييرات محفوظة على هذا الهاتف',
    label: 'دون اتصال. يُعرض ما هو محفوظ على هذا الهاتف.',
    waitingLabel: 'دون اتصال. تغييراتك محفوظة على هذا الهاتف وتُزامَن عندما تعود إلى الاتصال.',
  },
};
