// The widgets' words (src/lib/widgets/words.ts), written into their snapshot in the app's language. In English they are
// exactly what the widgets wrote themselves before (targets/widget, modules/android-widgets), so nothing changes for an
// English app; in Arabic they come out of the app's own strings, with its plurals and digits.

import { i18n } from '../../i18n';
import { widgetDayWords, widgetWords } from '../widgets/words';
import { widgetQibla } from '../widgets/qibla';

const NEW_YORK = { latitude: 40.7128, longitude: -74.006 };
const day = (o: Partial<{ title: string; total: number; done: number; completed: boolean; streak: number }> = {}) =>
  widgetDayWords({ title: 'An-Naba to At-Takwir', total: 5, done: 0, completed: false, streak: 7, ...o });

describe('in English', () => {
  it('the shared words are the widgets’ own, and leave the live values to them', () => {
    const w = widgetWords();
    expect(w).toMatchObject({
      language: 'en',
      rtl: false,
      today: 'Today',
      doneForToday: 'Done for today',
      revised: 'Revised',
      revisedToday: 'Revised today',
      continueLabel: 'Continue',
      startLabel: 'Start',
      left: 'left',
      openRevisely: 'Open Revisely',
      verseOfTheDay: 'Verse of the day',
      prayerTimes: 'Prayer times',
      countdown: 'in {time}',
      nextPrayerAt: 'Next prayer: {name} at {time}',
      north: 'N',
      samplePlace: 'Juz 30',
      digits: '0123456789',
    });
    expect(w.prayerNames).toEqual({ fajr: 'Fajr', sunrise: 'Sunrise', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' });
  });

  it('a day’s pieces read as the widgets’ lines did ("5 pages left", "2 of 5 done", "7-day streak")', () => {
    expect(day()).toEqual({
      pages: '5 pages',
      left: '5 pages left',
      leftToday: '5 pages left today',
      revised: '5 pages revised',
      leftCount: '5 left',
      leftNumber: '5',
      leftAndDone: '5 left · 0 done',
      doneOf: '0 of 5 done',
      streak: '7-day streak',
      streakShort: '7d',
      asTomorrow: 'Tomorrow · An-Naba to At-Takwir',
    });
    expect(day({ done: 2 })).toMatchObject({ left: '3 pages left', leftAndDone: '3 left · 2 done', doneOf: '2 of 5 done' });
    expect(day({ total: 1, done: 0 })).toMatchObject({ pages: '1 page', left: '1 page left' });
    expect(day({ done: 5, completed: true })).toMatchObject({ revised: '5 pages revised', leftNumber: '0' });
    expect(day({ streak: 0 })).toMatchObject({ streak: null, streakShort: null });
  });
});

describe('in Arabic', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ar');
  });
  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('says so, right to left, with Arabic-Indic digits', () => {
    const w = widgetWords();
    expect(w).toMatchObject({ language: 'ar', rtl: true, today: 'اليوم', countdown: 'بعد {time}', digits: '٠١٢٣٤٥٦٧٨٩' });
    expect(w.prayerNames.fajr).toBe('الفجر');
    expect(w.samplePlace).toBe('الجزء ٣٠');
  });

  it('a day’s pieces with Arabic’s plurals and digits', () => {
    expect(day()).toMatchObject({ pages: '٥ صفحات', left: 'بقيت ٥ صفحات', leftNumber: '٥', streak: 'أيام متتالية: ٧', streakShort: '٧ أيام' });
    expect(day({ total: 2 })).toMatchObject({ pages: 'صفحتان', left: 'بقيت صفحتان' });
    expect(day({ total: 11, streak: 11 })).toMatchObject({ pages: '١١ صفحة', streakShort: '١١ يومًا' });
    expect(day({ done: 2 })).toMatchObject({ doneOf: 'أُنجز ٢ من ٥' });
  });

  it('the Qibla’s lines, in Arabic', () => {
    const q = widgetQibla(NEW_YORK)!;
    expect(q.label).toBe('٥٨° شمال شرق');
    expect(q.line).toBe('القبلة ٥٨° شمال شرق');
    expect(q.toMakkah).toMatch(/^[٠-٩٬]+ كم إلى مكة$/);
    expect(q.degrees).toBe('٥٨°');
  });
});
