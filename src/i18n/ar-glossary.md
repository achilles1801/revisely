# Arabic glossary

The words and rules for Revisely in Arabic: the app's coming `ar/` strings, the website and the store listings. One
term per concept, so that a reader never wonders whether two words mean two things. Each choice says why, with a source.

It came out of the Arabic text review (Nov 2026; the full sheet with every string checked is in Majd's
`~/Documents/revisely-arabic/review.md`). The bar is Majd's: "if a native arabic speaker opened it they wouldnt even
second guess who wrote it". Terms marked **(confirm)** wait for a native speaker (Majd or his Qur'an teacher).

**Sources:**
- **[MS]** Microsoft's *Arabic (Saudi Arabia) Localization Style Guide*.
- **[AP]** Apple's Arabic support pages and iOS.
- **[TT]** Tarteel's Arabic App Store page.
- **[QC]** Quran.com in Arabic.
- **[MU]** The Madani mushaf's own text.
- **[CLDR]** Unicode's Arabic plural rules (what i18next uses).

Standard UI terms are taken from these sources. Nobody's sentences are copied.

## Voice

- **Modern Standard Arabic, in a product's register.** Write short sentences, warm and plain, the way the best Arabic
  apps write. Nothing literary, and nothing colloquial.
- **Write it in Arabic, not from the English.** Rebuild the sentence instead of keeping English word order [MS §2.1.4].
  - "Free and Premium, side by side" is «مقارنة بين الخطة المجانية وبريميوم», not «… جنبًا إلى جنب».
  - "New to Revisely?" is «ليس لديك حساب؟», not «جديد على ريفايزلي؟».
- **Instructions are imperatives:** «افتح الإعدادات», never «قم بفتح الإعدادات» [MS §2.1.3]. Don't stack «يُرجى»: once in
  a whole message at most, and usually not at all.
- **Buttons, menu items and control labels are verbal nouns,** as Apple's, Google's and Microsoft's Arabic are: «إرسال
  الطلب», «إعادة المحاولة», «تنزيل», «حذف الجلسة», «تشغيل». The one-word answers stay as everyone writes them: «تم»,
  «إلغاء», «لاحقًا». Links that are calls to action may be imperatives («قدِّم طلبك في الباب المفتوح»).
- **The user is "you", masculine singular,** as the generic form Apple, Google and Microsoft Arabic use («اضغط على…»,
  «حفظت ٣ أجزاء»). Where a verbal noun or an impersonal form reads as well, prefer it: it speaks to everyone. Words for
  people are general («المستخدمون», «الأشخاص») [MS §3.1]. **(confirm:** whether to address women too, see the open
  questions.)
- **"Your" once, not on every noun.** Never «الخاص بك/بها» [MS §2.1.3]. Write «خطتك», or «الخطة» when the owner is plain.
- **Passive only when it reads naturally,** with a damma on the first letter where it could be misread: «قُبل طلبك»,
  «تُنشأ الحسابات في التطبيق» [MS §4.1.16].

## Typography

- **Punctuation:** the Arabic comma ، semicolon ؛ and question mark ؟. No space before them and one after
  [MS §4.1.14]. Quotation marks are « » [the brief; Arabic print convention]. Ellipsis is «…».
- **Digits: Arabic-Indic (٠١٢٣٤٥٦٧٨٩) by default, until Majd decides** (open choice 1 below). Decimals are ٫ and percent
  is ٪ («٢٠٫٥٪»). The website already writes them (`ar-u-nu-arab`), and so do Quran.com's Arabic and the mushaf's
  verse numbers [QC][MU]. Microsoft prefers Western digits [MS §4.1.12], and many Gulf apps follow it. Use
  `formatNumber` and the date helpers from `src/i18n`, never digits typed into a string, so the decision is one change.
- **0, 1 and 2 are words, not digits:** «لا توجد صفحات», «صفحة واحدة», «صفحتان» [MS §4.1.12]. The plural keys below
  carry them.
- **Hamza:**
  - **Wasl alif takes no hamza.** That is the verbal nouns of five- and six-letter verbs: الانفطار، الانشقاق، انتقال،
    استخدام، استدراك.
  - **Qat' alif does:** إسراء، إنسان، إخلاص، إبراهيم، أجزاء [MS §4.1.9].
  - Write أ/إ wherever the hamza is written. «ا» for «أ» reads careless.
- **ة / ه and ى / ي** as the word is spelled: «الآية», «مكة», «الضحى», «على». Never ي for ى or the other way round.
- **Tanween fath sits on the letter before the alif:** «مجانًا», «جزءًا», «يومًا». The mushaf writes it this way
  [MU عَمَلًا], and so does the whole website. Only the licence's AI notice keeps its own «بديلاً».
- **No tatweel (ـ).** It never goes on a prefix before Latin or digits («لـ Revo», «بـ٥٦»): rephrase instead («أسئلة
  تطرحها على Revo», «في ٥٦ لغة», «باستخدام Apple»). The one exception is the Hijri abbreviation «هـ» («١٤٤١هـ»), which
  is always written so.
- **Harakat only where a word could be misread** [MS §4.1.7]:
  - the passive («قُبل»);
  - a fronted object («يقرأ كلَّ طلبٍ إنسانٌ»);
  - «وِرد», which would otherwise read as «وَرد» (roses).
  Surah names are the exception: they are voweled only where the design shows `nameArabicVoweled`.
- **Latin inside Arabic sits in a first-strong isolate** (⁨…⁩, U+2068/U+2069): Revo, reciter names, version numbers,
  emails, a `{{value}}` that could hold Latin. The repo's rule is CLAUDE.md, "The design → Fonts".
- **Quoting the app's labels:**
  - **Text that quotes the English app** (the website and store listings, while the app is English) keeps the English
    label in an isolate. A multi-word label mid-sentence also gets Arabic quotes outside the isolate: «⁨Mark mistakes⁩».
    A one-word label needs only the isolate: ⁨Settings⁩.
  - **In the `ar/` strings and the Arabic help topics,** a label is the Arabic UI text itself, with no isolate. Help's
    `{{Label}}` must match it exactly, which is why one term per concept matters most there.
- **Steps in a path** are joined with «←», which points the reading way in Arabic: ⁨Settings⁩ ← ⁨Prayer⁩.
- **Chevrons never go in a string.** The code adds `chevron()` / `backChevron()` (`src/i18n/direction.ts`).
- **Names stay in Latin** (brands, products, platforms): App Store, Google Play, iPhone, Android, Google, Apple,
  Claude, Anthropic, Revo, Sentry [MS §5.2][AP]. The app's name in Arabic prose is «ريفايزلي», as the website writes
  it; its logo stays Latin.

## Numbers and plurals

i18next uses Arabic's six CLDR forms (Intl.PluralRules), so a counted string needs all six keys. Arabic uses `_zero`
at 0, where English shows "0 pages", so `_zero` says what nothing reads as. `_one` and `_two` may leave out
`{{count}}`. The keys: `_zero`, `_one`, `_two`, `_few` (3–10, and
103–110…), `_many` (11–99, and 111–199…) and `_other` (100–102, 200…). With digits, the noun's form is what changes:

| Key | صفحة (page) | آية (ayah) | جزء (juz) | سورة (surah) | يوم (day) | دقيقة (minute) |
| --- | --- | --- | --- | --- | --- | --- |
| `_zero` | لا توجد صفحات | لا توجد آيات | لا توجد أجزاء | لا توجد سور | لا توجد أيام | لا توجد دقائق |
| `_one` | صفحة واحدة | آية واحدة | جزء واحد | سورة واحدة | يوم واحد | دقيقة واحدة |
| `_two` | صفحتان | آيتان | جزءان | سورتان | يومان | دقيقتان |
| `_few` | {{count}} صفحات | {{count}} آيات | {{count}} أجزاء | {{count}} سور | {{count}} أيام | {{count}} دقائق |
| `_many` | {{count}} صفحة | {{count}} آية | {{count}} جزءًا | {{count}} سورة | {{count}} يومًا | {{count}} دقيقة |
| `_other` | {{count}} صفحة | {{count}} آية | {{count}} جزء | {{count}} سورة | {{count}} يوم | {{count}} دقيقة |

More nouns, in the same order (one, two, few, many, other):
- **خطأ:** خطأ واحد، خطآن، ٣ أخطاء، ١١ خطأً، ١٠٠ خطأ.
- **كلمة:** كلمة واحدة، كلمتان، ٣ كلمات، ١١ كلمة، ١٠٠ كلمة.
- **سؤال:** سؤال واحد، سؤالان، ٣ أسئلة، ١١ سؤالًا، ١٠٠ سؤال.
- **تسجيل:** تسجيل واحد، تسجيلان، ٣ تسجيلات، ١١ تسجيلًا، ١٠٠ تسجيل.
- **جلسة:** جلسة واحدة، جلستان، ٣ جلسات، ١١ جلسة، ١٠٠ جلسة.

Rules:
- **3–10 take the plural, 11–99 an accusative singular, 100 and up a genitive singular.** Quran.com's «٢٨٦ آيات» is a
  slip; it should be «٢٨٦ آية».
- **A number spelled out takes the opposite gender to a singular noun from 3 to 10:** «ثلاث صفحات» but «ثلاثة أيام».
  With digits this never shows. Spell out only 1 and 2 (above) and ordinals.
- **Ordinals for a juz** in a heading: «الجزء الثامن والعشرون». In a row or a count, digits: «الجزء ٢٨».
- **"6 of 20":** «٦ من ٢٠». **"1 of 5":** «١ من ٥».

## Terms

The English is the app's label (as in `src/i18n/en`), or the concept where there is no label.

### The Qur'an

| English | Arabic | Avoid | Why |
| --- | --- | --- | --- |
| the Qur'an / Quran | القرآن (القرآن الكريم in titles) | قرآن without the article in running text | [QC] |
| surah / surahs | سورة / سور | سورات | [QC] |
| ayah / ayahs | آية / آيات | | [QC] |
| juz / juz' | جزء / أجزاء | | [QC] |
| hizb, quarter | حزب / أحزاب، ربع / أرباع | | Mushaf divisions |
| page / pages | صفحة / صفحات | | |
| the mushaf | المصحف | | |
| the Madani mushaf | المصحف المدني (formal: مصحف المدينة النبوية) | | What readers say. The King Fahd Complex's own name is the formal one. |
| print (1405, 1441) | طبعة («طبعة ١٤٤١هـ») | إصدار | KFGQPC prints |
| Uthmani script | الرسم العثماني | الخط العثماني | [QC] |
| Makki / Madani | مكية / مدنية | | |
| tajweed | التجويد | | |
| similar ayahs (mutashabihat) | الآيات المتشابهة (المتشابهات) | | The memorization community's word |
| reciter / reciters | القارئ / القرّاء | المقرئ for an audio reciter | |
| recitation (audio) | التلاوة | القراءة, for audio | |
| translation (of the meanings) | الترجمة; in full: ترجمة معاني القرآن | ترجمة القرآن, in titles | QuranEnc's and the King Fahd Complex's wording. |
| tafsir | التفسير | | |
| verse of the day | آية اليوم | | [QC] |
| a citation | [البقرة: ٢٥٥]; in a sentence: «الآية ٢٥٥ من سورة البقرة» | 2:255, «البقرة ٢٥٥» | Arabic print convention |
| a range | «البقرة، الآيات ١٤٢–١٧٦»; «من سورة المجادلة إلى سورة التحريم» | | Surahs and juz first (NAME-1), as in English |
| surah names | `nameArabic` / `nameArabicVoweled` from `lib/quranData` | typing them again | The tables are checked (`surahNamesArabic.test.ts`) |

### Memorizing and revising

| English | Arabic | Avoid | Why |
| --- | --- | --- | --- |
| revision, revise | المراجعة، راجَع | التنقيح، المذاكرة | The community's word |
| today's revision | مراجعة اليوم | | |
| daily portion (in copy) | الوِرد اليومي | | The community's word [TT «الورد اليومي»]. Vowel وِرد. |
| memorize, memorized | حفظ، محفوظ | | |
| memorized pages | الصفحات المحفوظة | | |
| "% of the Quran memorized" | «٢٠٫٥٪ من القرآن محفوظ» / «حفظت ٢٠٫٥٪ من القرآن» | | |
| strength, strong, weak | قوة الحفظ، متين، ضعيف | | |
| weak spots | مواضع الضعف | نقاط الضعف, for pages | |
| fixing it in memory | التثبيت، يثبت | | The community's word («حتى يثبت») |
| plan | الخطة | البرنامج | |
| schedule; Edit schedule | الجدول؛ تعديل الجدول | | |
| session; revision session | جلسة؛ جلسة مراجعة | حصة | |
| Start revision | بدء المراجعة | ابدأ المراجعة, on a button | Verbal noun on a button |
| sitting (a timed reading) | جلسة قراءة | | |
| streak | الأيام المتتالية («٧ أيام متتالية») | سلسلة، ستريك | [TT «تتابع الأيام»]. «سلسلة» alone doesn't say what it counts. |
| catch-up, carried pages | استدراك ما فات؛ «٤ صفحات من الأمس أولًا» | | |
| Jump to | الانتقال إلى | القفز إلى | |
| Activity | النشاط | | |
| Insights | الإحصاءات | الرؤى | What the website already says |
| Daily log | السجل اليومي | المذكرات | |
| teacher (one you recite to) | معلّم / شيخ; «تقرأ عليه» | «تدرس مع» | The community's phrasing: القراءة على شيخ |
| halaqa | حلقة التحفيظ | | |

### Recite and mistakes

| English | Arabic | Avoid | Why |
| --- | --- | --- | --- |
| Recite (the page follows you) | متابعة التلاوة; in a sentence «الصفحة تتابع تلاوتك» | تتبّع | [TT «متابعة التلاوة»] |
| Mark mistakes | تحديد الأخطاء **(confirm)** | تعليم الأخطاء | «تعليم» reads first as "teaching". [TT] says «اكتشاف أخطاء الحفظ». |
| reciting from memory (to check it) | التسميع، سمّع | الاختبار | The community's word [TT] |
| a take | تسميع (pl. مرات التسميع / التسميعات) **(confirm)** | محاولة, as a noun for it | One go at reciting with the checker |
| Recited (a day's takes) | ما سمّعته | | |
| wrong word | كلمة خاطئة | كلمة خطأ | The adjective, not the noun |
| skipped word | كلمة متروكة **(confirm:** or ساقطة**)** | محذوفة | |
| extra word | كلمة زائدة | | |
| harakat slip | خطأ في الحركات | خطأ تشكيل, in labels | |
| letter slip | خطأ في الحروف | | |
| Not clear | غير واضح | | |
| tajweed note | ملاحظة تجويد | خطأ تجويد | It is never counted as a mistake |
| Not a mistake / Put back / Undo | ليس خطأً / إعادة / تراجع | | Undo is تراجع [AP] |
| Strict | الوضع الصارم **(confirm:** or وضع التدقيق**)** | | Strict modes in Arabic browsers say «صارم» |
| Words & harakat | الكلمات والحركات | | |
| Peek | إلقاء نظرة | | [TT] |
| hide the verses / hidden view | إخفاء الآيات | | [TT] |
| Test me | اختبرني | | |
| Recite the mistakes again | إعادة تسميع الأخطاء | | Verbal noun on a button |
| Hear it | الاستماع | | |
| score | النتيجة | الدرجة | |
| Clean | بلا أخطاء | نظيف | |

### Audio, prayer, Qibla

| English | Arabic | Avoid | Why |
| --- | --- | --- | --- |
| play / pause / stop | تشغيل / إيقاف مؤقت / إيقاف | | [AP] |
| repeat, speed | التكرار، السرعة | | |
| Audio Options | خيارات الصوت | | |
| prayer times | مواقيت الصلاة | أوقات الصلاة, in titles | [QC] and the prayer apps |
| Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha | الفجر، الشروق، الظهر، العصر، المغرب، العشاء | | `lib/prayer/times.ts` |
| calculation method | طريقة الحساب | | |
| Hanafi (Asr) | الحنفي | | |
| Qibla | القبلة; "Facing the Qibla" «باتجاه القبلة» | | |
| Makkah | مكة (مكة المكرمة in titles) | | |

### The app and the account

| English | Arabic | Avoid | Why |
| --- | --- | --- | --- |
| Settings | الإعدادات | | [AP] |
| notifications, reminder | الإشعارات، تذكير | التنبيهات, for notifications | [AP] |
| widget | أداة / الأدوات | ويدجت | [AP] |
| download / upload | تنزيل، نزّل / رفع | تحميل، حمّل, for download | [AP][MS]. «تحميل» is ambiguous. |
| offline | دون اتصال (in copy: دون إنترنت) | أوفلاين | |
| sync | مزامنة | | [AP] |
| backup, back up | النسخ الاحتياطي، نسخة احتياطية | حفظ | حفظ means memorizing here |
| save | حفظ (the button only) | | Unavoidable as a button. Elsewhere use سُجّل/تُسجَّل. |
| recording | تسجيل | | |
| sign in / sign out | تسجيل الدخول / تسجيل الخروج | الولوج | [AP] |
| Continue with Google; Sign in with Apple | المتابعة باستخدام Google؛ تسجيل الدخول باستخدام Apple | بـ Apple | Google's and Apple's own Arabic |
| account, password | الحساب، كلمة المرور | كلمة السر | Google and Microsoft. Apple says كلمة السر; the website already says كلمة المرور. |
| delete account | حذف الحساب | | |
| tap / touch and hold / swipe | اضغط على / اضغط مطوّلًا / اسحب | انقر, on a phone | [AP] |
| Done, Cancel, Save, Delete, Edit, Close, Later | تم، إلغاء، حفظ، حذف، تعديل، إغلاق، لاحقًا | | [AP] |
| Continue, Try again, Update now | متابعة، إعادة المحاولة، التحديث الآن | حاول مرة أخرى, on a button | [MS §4.1.14] |
| Share, Copy, Copied | مشاركة، نسخ، تم النسخ | | [AP] |
| Search, See all, More | البحث، عرض الكل، المزيد | | [AP] |
| Couldn't load / connect… | تعذّر تحميل… / تعذّر الاتصال… | فشل | Apple's and Google's error opening |
| Help, What's new | المساعدة، الجديد في ريفايزلي | | |
| Premium | بريميوم **(confirm)** | | Majd approved بريميوم (Nov 14). Tarteel and Telegram translate it («ترتيل المميز»). |
| Free (the plan) | مجاني; the Free plan الخطة المجانية | المجاني, as a title | |
| early access | الوصول المبكر | | Google Play's Arabic |
| subscription, gift, family plan | اشتراك، هدية، خطة العائلة | | |
| Open Door | الباب المفتوح | | |
| Revo; assistant | Revo; المساعد | ريفو | A name stays Latin [MS §5.2] |
| Day in review | ملخّص اليوم | | |
| Revo's memory | ما يتذكّره Revo | ذاكرة Revo | |

## Islamic phrases

Spell them exactly so:
- **«بإذن الله»** (bi-idhnillah) and **«إن شاء الله»**, in three words (never إنشاء الله).
- **«ما شاء الله»** and **«جزاكم الله خيرًا»** (جزاك to one person).
- **«بارك الله فيك»** and **«السلام عليكم»**.
- **«صلى الله عليه وسلم»** in prose, or ﷺ (U+FDFA) where space is short.
- **«رضي الله عنه»** and **«سبحانه وتعالى»**.

Qur'an quotations go between the ornate brackets ﴿ ﴾, followed by the citation: ﴿وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ﴾
[القمر: ١٧]. Never change Qur'an text, or a licensed translation or its credit.

## Dates and times

- Use the `src/i18n` helpers (`formatDate`, `formatTime`, `weekdayName`, `monthName`). Never write a date into a string.
- With `ar`, Intl names the months يناير، فبراير… (Gulf and Egypt). The Levant's كانون الثاني… is a regional choice the
  phone's locale can make.
- Morning and evening are «ص» and «م». "Today", "yesterday" and "tomorrow" are «اليوم», «أمس» and «غدًا».

## Already on the website

The website's Arabic (`docs/assets/strings.js`, approved by Majd on Nov 14; `strings-site.js`) uses these terms since
the review's #747: «تحديد الأخطاء» (it said «تعليم الأخطاء»), «الصفحة تتابع تلاوتك (Recite)» (it said «تتبعك الصفحة»),
and «نسخة احتياطية» for backup (it said «محفوظة» / «وحفظها»). If Majd picks another term below, the site and the app
change in the same decision.

## Majd's four open choices (App in Arabic)

From `~/Documents/revisely-handoffs/app-in-arabic-2.md`. Each has App in Arabic's pick; none is settled yet.
1. **Digits:** follow the phone's setting, else Arabic-Indic like the site.
2. **Font:** system Arabic for the interface, Amiri for the Qur'an and surah names.
3. **Revo's language:** the app's language.
4. **Translation:** Claude drafts, Majd checks.

## Open questions (native speaker or Majd)

1. **Premium:** بريميوم, as approved, or «المميّز», as Tarteel and Telegram write it?
2. **Mark mistakes:** تحديد الأخطاء, «اكتشاف الأخطاء» or «التنبيه على الأخطاء»?
3. **Skipped word:** «متروكة» or «ساقطة» (the halaqa word: أسقط كلمة)?
4. **Strict:** «الوضع الصارم» or «وضع التدقيق»?
5. **A take:** «تسميع» (pl. «التسميعات»)?
6. **Digits:** see Majd's open choice 1.
7. **Addressing women:** keep the generic masculine (as Apple and Google), or add feminine forms where they are cheap?
   Women memorize with women teachers, so «معلّم» might become «معلّم أو معلّمة» in places.
8. **Recite:** «متابعة التلاوة» as its Arabic name?
9. **Saheeh International's credit:** may the Arabic UI translate the words around the names («issued by» → «صادرة عن»),
   or does the whole credit stay as QuranEnc gives it? (The Clear Quran® credit and Tanzil's notice stay word for word.)
