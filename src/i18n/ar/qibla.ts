// Arabic for src/i18n/en/qibla.ts. Words and forms: src/i18n/ar-glossary.md.
import type { ArStrings } from './types';

export const qibla: NonNullable<ArStrings['qibla']> = {
  title: 'القبلة',
  facts: '{{bearing}} من الشمال · {{distance}} إلى مكة',
  fromNorth: '{{bearing}} من الشمال',
  toMakkah: '{{distance}} إلى مكة',
  findingNorth: 'جارٍ تحديد الشمال… · {{distance}} إلى مكة',
  facing: 'باتجاه القبلة',
  calibrate: { title: 'معايرة البوصلة', body: 'حرّك هاتفك على شكل الرقم ٨ بضع مرات، بعيدًا عن المعادن والمغناطيس.' },
  atKaaba: 'أنت عند الكعبة',
  permission: {
    title: 'السماح بالموقع لتحديد القبلة',
    body: 'يحسب ريفايزلي اتجاه مكة من مكانك. يبقى موقعك على هذا الهاتف.',
    allow: 'السماح بالموقع',
  },
  denied: { title: 'الموقع متوقف لريفايزلي', body: 'فعّله في الإعدادات لتحديد القبلة.' },
  locating: 'جارٍ تحديد مكانك…',
  noLocation: { title: 'تعذّر تحديد مكانك', body: 'تأكد من تشغيل خدمات الموقع، ثم حاول مرة أخرى.' },
  straightAhead: 'إلى الأمام مباشرة',
  turnRight: 'استدر يمينًا {{n}}°',
  turnLeft: 'استدر يسارًا {{n}}°',
  km: '{{n}} كم',
};
