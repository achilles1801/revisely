// Arabic for src/i18n/en/reader.ts. Words and forms: src/i18n/ar-glossary.md.
import type { ArStrings } from './types';

export const reader: NonNullable<ArStrings['reader']> = {
  player: {
    play: 'تشغيل',
    pause: 'إيقاف مؤقت',
    retry: 'إعادة المحاولة',
    stop: 'إيقاف',
    options: 'خيارات الصوت',
    failed: 'تعذّر التشغيل. تحقّق من اتصالك.',
    speed: 'السرعة {{speed}}. تغيير السرعة',
    previous: 'الآية السابقة',
    next: 'الآية التالية',
    playFromPage: 'التشغيل من هذه الصفحة',
    chooseReciter: '⁨{{reciter}}⁩. اختيار القارئ',
  },
  speedMenu: {
    close: 'إغلاق قائمة السرعة',
    option: 'السرعة {{speed}}',
  },
  activity: {
    recording: 'جارٍ التسجيل، {{time}}',
    recordingPaused: 'التسجيل متوقف مؤقتًا، {{time}}',
    reciting: 'تلاوة ⁨{{verse}}⁩',
    recitationPaused: 'التلاوة متوقفة مؤقتًا ⁨{{verse}}⁩',
    timerRunning: 'المؤقّت يعمل، {{clock}}',
    timerPaused: 'المؤقّت متوقف مؤقتًا، {{clock}}',
    label: '{{what}}. إظهار عناصر التحكم',
  },
};
