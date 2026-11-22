// The widgets' words, in the app's language (src/i18n/en/widgets.ts), written into their snapshot: the widgets show the
// app's language, which Settings → Appearance → Language can make different from the phone's, and the plurals and
// digits come out of the app's strings rather than being written again in Swift and Kotlin. The widgets keep the same
// English built in, for a snapshot from before this (targets/widget/Words.swift, modules/android-widgets Words.kt).
//
// A day's lines differ by widget and size, so a day carries the pieces they're made of ("5 pages left", "2 of 5
// done", "7-day streak"), and each widget joins them as it always has (with " · ").

import { currentLanguage, formatNumber, t } from '../../i18n';
import { isRTLLanguage } from '../../i18n/direction';
import { widgetQibla, type WidgetQibla } from './qibla';

/** The gallery's Qibla is worked out from here, as the Android widget picker's example. */
const NEW_YORK = { latitude: 40.7128, longitude: -74.006 };

/** Where a live value goes in a template the widget fills in itself ("in {time}"). */
export const SLOT = { time: '{time}', name: '{name}' } as const;

export interface WidgetWords {
  /** The app's language ('en', 'ar') and whether it reads right to left. */
  language: string;
  rtl: boolean;
  galleryToday: string;
  galleryTodayDescription: string;
  galleryVerse: string;
  galleryVerseDescription: string;
  galleryQibla: string;
  galleryQiblaDescription: string;
  galleryPrayer: string;
  galleryPrayerDescription: string;
  today: string;
  revised: string;
  revisedToday: string;
  doneForToday: string;
  todayDone: string;
  continueLabel: string;
  startLabel: string;
  left: string;
  openRevisely: string;
  openToSeeToday: string;
  openToSetUp: string;
  verseOfTheDay: string;
  prayer: string;
  prayerTimes: string;
  openToSeePrayer: string;
  prayerTimesOpen: string;
  /** "in {time}": the widget puts its live countdown where {time} is. */
  countdown: string;
  /** "Next prayer: {name} at {time}". */
  nextPrayerAt: string;
  qiblaOpen: string;
  qiblaOpenLabel: string;
  north: string;
  /** The six times' names, as the app says them. */
  prayerNames: { fajr: string; sunrise: string; dhuhr: string; asr: string; maghrib: string; isha: string };
  /** The gallery's example day. */
  sampleTitle: string;
  samplePlace: string;
  /** The example day's pieces (five pages to go, a 7-day streak). */
  sampleDay: WidgetDayWords;
  /** The gallery's Qibla, from New York. */
  sampleQibla: WidgetQibla;
  /** Digits 0–9 in the language ("٠١٢٣٤٥٦٧٨٩" in Arabic), for numbers the widget writes itself (a verse's reference). */
  digits: string;
}

/** One day's pieces, in the app's language. */
export interface WidgetDayWords {
  /** All the day's pages: "5 pages". */
  pages: string;
  /** "5 pages left", "5 pages left today". */
  left: string;
  leftToday: string;
  /** "5 pages revised". */
  revised: string;
  /** The number left alone, for tight places: "20 left", and "20" for the circle. */
  leftCount: string;
  leftNumber: string;
  /** "3 left · 2 done", "2 of 5 done". */
  leftAndDone: string;
  doneOf: string;
  /** "7-day streak", "7d"; null without a streak. */
  streak: string | null;
  streakShort: string | null;
  /** "Tomorrow · <this day's title>": what the day before shows once it's done. */
  asTomorrow: string;
}

export function widgetWords(): WidgetWords {
  const language = currentLanguage();
  return {
    language,
    rtl: isRTLLanguage(language),
    galleryToday: t('widgets.gallery.todayName'),
    galleryTodayDescription: t('widgets.gallery.todayDescription'),
    galleryVerse: t('widgets.gallery.verseName'),
    galleryVerseDescription: t('widgets.gallery.verseDescription'),
    galleryQibla: t('widgets.gallery.qiblaName'),
    galleryQiblaDescription: t('widgets.gallery.qiblaDescription'),
    galleryPrayer: t('widgets.gallery.prayerName'),
    galleryPrayerDescription: t('widgets.gallery.prayerDescription'),
    today: t('widgets.today'),
    revised: t('widgets.revised'),
    revisedToday: t('widgets.revisedToday'),
    doneForToday: t('widgets.doneForToday'),
    todayDone: t('widgets.todayDone'),
    continueLabel: t('widgets.continue'),
    startLabel: t('widgets.start'),
    left: t('widgets.left'),
    openRevisely: t('widgets.openRevisely'),
    openToSeeToday: t('widgets.openToSeeToday'),
    openToSetUp: t('widgets.openToSetUp'),
    verseOfTheDay: t('widgets.verseOfTheDay'),
    prayer: t('widgets.prayer'),
    prayerTimes: t('widgets.prayerTimes'),
    openToSeePrayer: t('widgets.openToSeePrayer'),
    prayerTimesOpen: t('widgets.prayerTimesOpen'),
    countdown: t('widgets.countdown', { time: SLOT.time }),
    nextPrayerAt: t('widgets.nextPrayerAt', { name: SLOT.name, time: SLOT.time }),
    qiblaOpen: t('widgets.qiblaOpen'),
    qiblaOpenLabel: t('widgets.qiblaOpenLabel'),
    north: t('widgets.north'),
    prayerNames: {
      fajr: t('prayer.names.fajr'),
      sunrise: t('prayer.names.sunrise'),
      dhuhr: t('prayer.names.dhuhr'),
      asr: t('prayer.names.asr'),
      maghrib: t('prayer.names.maghrib'),
      isha: t('prayer.names.isha'),
    },
    sampleTitle: t('widgets.sampleTitle'),
    samplePlace: t('common.juzN', { n: 30 }),
    sampleDay: widgetDayWords({ title: t('widgets.sampleTitle'), total: 5, done: 0, completed: false, streak: 7 }),
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    sampleQibla: widgetQibla(NEW_YORK)!,
    digits: Array.from({ length: 10 }, (_, d) => formatNumber(d)).join(''),
  };
}

/** A day's pieces, from its counts (WidgetDay in snapshot.ts). */
export function widgetDayWords(day: { title: string; total: number; done: number; completed: boolean; streak: number }): WidgetDayWords {
  const left = day.completed ? 0 : Math.max(day.total - day.done, 0);
  const pagesLeft = t('common.pages', { count: left });
  return {
    pages: t('common.pages', { count: day.total }),
    left: t('widgets.pagesLeft', { pages: pagesLeft }),
    leftToday: t('widgets.pagesLeftToday', { pages: pagesLeft }),
    revised: t('widgets.pagesRevised', { pages: t('common.pages', { count: day.total }) }),
    leftCount: t('widgets.leftCount', { n: left }),
    leftNumber: formatNumber(left),
    leftAndDone: t('widgets.leftAndDone', { left, done: day.done }),
    doneOf: t('widgets.doneOf', { done: day.done, total: day.total }),
    streak: day.streak > 0 ? t('widgets.streak', { n: day.streak }) : null,
    streakShort: day.streak > 0 ? t('widgets.streakShort', { count: day.streak }) : null,
    asTomorrow: t('widgets.tomorrow', { title: day.title }),
  };
}
