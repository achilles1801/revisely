// Arabic for src/i18n/en/updates.ts. Words and forms: src/i18n/ar-glossary.md.
import type { ArStrings } from './types';

export const updates: NonNullable<ArStrings['updates']> = {
  staysAsIs: 'تبقى خطتك وإنجازاتك وتسجيلاتك كما هي.',
  ready: {
    title: 'تحديث جديد جاهز',
    body: 'يُعاد تشغيل ريفايزلي لإكمال التحديث. يستغرق لحظة.',
    now: 'التحديث الآن',
    later: 'لاحقًا',
  },
  store: {
    title: 'إصدار جديد متاح',
    body: 'ريفايزلي ⁨{{version}}⁩ متاح على {{store}}.',
    update: 'تحديث',
    notNow: 'ليس الآن',
  },
  required: {
    title: 'التحديث مطلوب',
    body: 'هذا الإصدار من ريفايزلي لم يعد مدعومًا. نزّل الإصدار ⁨{{minimum}}⁩ أو أحدث من {{store}} لتواصل المراجعة. تبقى خطتك وإنجازاتك وتسجيلاتك كما هي.',
    update: 'تحديث',
    installed: 'المثبّت: ⁨{{version}}⁩',
  },
  storeName: {
    ios: '⁨App Store⁩',
    android: '⁨Google Play⁩',
  },
};
