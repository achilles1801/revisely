// Arabic for src/i18n/en/settings.ts (the parts translated so far; the rest shows in English).
import type { ArStrings } from './types';

export const settings: NonNullable<ArStrings['settings']> = {
  accent: 'اللون المميز',
  title: 'الإعدادات',
  sections: {
    account: 'الحساب',
    activity: 'النشاط',
    homeScreen: 'الشاشة الرئيسية',
    prayer: 'الصلاة',
    dayBoundary: 'بداية اليوم',
    revision: 'المراجعة',
    revo: '⁨Revo AI⁩',
    mushaf: 'المصحف',
    recite: 'متابعة التلاوة',
    notifications: 'الإشعارات',
    appearance: 'المظهر',
    support: 'الدعم',
    about: 'حول التطبيق',
    testing: 'الاختبار',
    dev: 'التطوير',
  },
  on: 'تشغيل',
  off: 'إيقاف',
  selected: '{{label}}، محدد',
  appearance: {
    theme: 'السمة',
    system: 'النظام',
    light: 'فاتح',
    dark: 'داكن',
    ramadan: 'سمة رمضان',
    ramadanSub: 'فوانيس وأضواء ونجوم تتساقط',
  },
  language: {
    row: 'اللغة',
    system: 'لغة الجهاز',
    systemSub: 'الآن ⁨{{language}}⁩',
    restartTitle: 'إعادة تشغيل ريفايزلي؟',
    restartBody: 'يُغلَق التطبيق ثم يُفتَح من جديد باللغة التي اخترتها.',
    restart: 'إعادة التشغيل',
  },
};
