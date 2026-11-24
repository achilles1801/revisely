// Arabic for What's new (whatsNew.ts), shown when the app is in Arabic (cardsFor): a card or row's title and words,
// keyed release/card or release/card/row.
//
// Each entry keeps `from`, a hash of the English it was translated from (title, and `\n` + text when it has one).
// __tests__/whatsNewArabic.test.ts fails when that English changes: redo the Arabic and its `from`, or delete the
// entry, and the English shows until it is translated again. {{Label}} is the Arabic app's own text; [[icon]] as in
// English. Words and forms: src/i18n/ar-glossary.md.

import type { ArabicHelpText } from './topics.ar';

export const WHATS_NEW_AR: Readonly<Record<string, ArabicHelpText>> = {
  '2026-11/activity': {
    title: 'أيامك في النشاط',
    text: 'تقويم لما أنجزته. افتح يومًا لترى ما راجعته وحفظته وسجّلته. و{{الإحصاءات}} تبويبه الثاني.',
    from: 'fac8ad0371e00e52',
  },
  '2026-11/elsewhere': {
    title: 'راجعت في مكان آخر؟',
    text: 'مع معلّمك أو في المسجد: افتح اليوم في النشاط واضغط [[plus]]. يُحتسب لليوم ولأيامك المتتالية.',
    from: '1d5fbaf936984d2b',
  },
  '2026-11/ayah': {
    title: 'احفظ آيةً آيةً',
    text: 'حدّد ما حفظته آيةً آيةً. احسب وقت جلسة قراءة أو سجّل تلاوتك في المصحف، فيُسجَّل ذلك في يومه.',
    from: 'f6e17f75069c778a',
  },
  '2026-11/revo': {
    title: 'تعرّف على ⁨Revo⁩',
    text: 'اسأل عن مراجعتك، أو عن طريقة عمل أي شيء في التطبيق.',
    from: 'f72a9076461ab43c',
  },
  '2026-11/more': {
    title: 'جديد أيضًا',
    from: '35a844c10f442901',
  },
  '2026-11/more/help': {
    title: 'المساعدة في الشاشات',
    text: 'اضغط [[help]] لدليل قصير لتلك الشاشة.',
    from: 'e5defb558b20a9e8',
  },
  '2026-11/more/translations': {
    title: 'ترجمات أكثر',
    text: 'اقرأ المعاني بلغات أكثر.',
    from: '2dc738bac7da7a80',
  },
  '2026-11/more/offline': {
    title: 'يعمل دون اتصال',
    text: 'المصحف كله على هاتفك، والمراجعة تُسجَّل دون اتصال.',
    from: '3cbba01aa04fdf64',
  },
  '1.0.5/recite': {
    title: 'سمّع، واعرف أخطاءك',
    text: 'اضغط [[mic]] في المصحف وسمّع من حفظك. تتابعك الصفحة، ومع تشغيل {{تحديد الأخطاء}} يُظلَّل كل خطأ أولًا بأول.',
    from: '64ba5dc4820a734e',
  },
  '1.0.5/marks': {
    title: 'كل خطأ، مع شرحه',
    text: 'اضغط على التظليل لترى ما كان متوقعًا، وتسمع الآية، وتسمع نفسك في ذلك الموضع. {{غير واضح}} لا يُحتسب أبدًا، و{{ليس خطأً}} يزيل الخطأ.',
    from: '3d462b1b433ce142',
  },
  '1.0.5/again': {
    title: 'حتى يثبت',
    text: '{{إعادة تسميع الأخطاء}} تمرّ على تلك الآيات وحدها. ويبقى الخطأ محددًا في الصفحة حتى تقوله صحيحًا في يومين مختلفين.',
    from: '8812a20f32c5a9ae',
  },
  '1.0.5/gaps': {
    title: 'فترات الانقطاع في الإحصاءات',
    text: 'اطّلع على كل مرة مضى فيها يومان أو أكثر دون مراجعة، ومع {{آخر مراجعة}} متى راجعت آخر مرة كل سورة وجزء.',
    from: 'd35654b9042d1349',
  },
  '1.0.5/more': {
    title: 'جديد أيضًا',
    from: '35a844c10f442901',
  },
  '1.0.5/more/test': {
    title: 'اختبرني',
    text: 'اضغط مطوّلًا على [[mic]] واختر {{اختبرني}}: آية عشوائية مما حفظته، ثم أكمل منها.',
    from: 'f212bf829de52a49',
  },
  '1.0.5/more/recitation': {
    title: 'تسميعك في الإحصاءات',
    text: 'نتيجتك عبر الوقت، والمواضع التي تتكرر فيها الأخطاء. ويعرفها ⁨Revo⁩ أيضًا: اسأله عمّا تتكرر فيه أخطاؤك، أو عن تسميع واحد.',
    from: '32cbe3913060a152',
  },
  '1.0.5/more/premium': {
    title: 'بريميوم، في الوصول المبكر',
    text: '{{تحديد الأخطاء}} و{{اختبرني}} جزء من بريميوم: مجانًا للجميع خلال الوصول المبكر، ولك مدى الحياة.',
    from: 'e78524bdedf41af1',
  },
  '1.0.5/more/search': {
    title: 'بحث جديد',
    text: 'الحقل والميكروفون في الأسفل، وكل آية يجدها البحث تأتي مع معناها.',
    from: '40c071678cc6b794',
  },
};
