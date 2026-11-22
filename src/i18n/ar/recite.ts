// Arabic for src/i18n/en/recite.ts. Words and forms: src/i18n/ar-glossary.md.
import type { ArStrings } from './types';

export const recite: NonNullable<ArStrings['recite']> = {
  checkPrivacy: 'يذهب تسجيلك إلى خادم ريفايزلي ليُفحَص. يحكم عليه برنامج، ولا يستمع إليه أحد.',
  model: {
    noSpace: 'وفّر {{size}} أو أكثر على هذا الجهاز، ثم حاول مرة أخرى.',
    stopped: 'توقف التنزيل. تحقّق من اتصالك وحاول مرة أخرى.',
  },
  speechModel: {
    title: 'البحث بالصوت',
    intro: 'اقرأ بضع كلمات، ويجد ريفايزلي الآية.',
    privacy: 'يعمل على هذا الجهاز: لا يُسجَّل صوتك ولا يُرسَل إلى أي مكان.',
    downloading: 'جارٍ تنزيل {{percent}}٪ من {{size}}. يمكنك إغلاق هذه النافذة؛ يستمر التنزيل.',
    oneTimeCellular: 'تنزيل لمرة واحدة بحجم {{size}}. أنت متصل ببيانات الجوّال.',
    oneTime: 'تنزيل لمرة واحدة بحجم {{size}}.',
    downloadCellular: 'التنزيل عبر بيانات الجوّال',
    download: 'تنزيل {{size}}',
  },
};
