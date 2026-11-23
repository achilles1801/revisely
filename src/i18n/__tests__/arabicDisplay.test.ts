// What the first right-to-left screenshots (E2E flow 21, Nov 22 2026) showed still in English or in Western digits in
// the Arabic app, each now in the app's language, with its English exactly as before.

import { formatPercentage, i18n, weekdayLetters } from '..';
import { describeSurahs } from '../../lib/pageRanges';
import { formatPace, hourRange } from '../../lib/insightsView';
import { formatDuration } from '../../lib/readingTimer';
import { scrubberPreview } from '../../lib/mushafScrubber';

async function inArabic(check: () => void) {
  await i18n.changeLanguage('ar');
  try {
    check();
  } finally {
    await i18n.changeLanguage('en');
  }
}

it('the calendars’ weekday letters', async () => {
  expect(weekdayLetters()).toEqual(['S', 'M', 'T', 'W', 'T', 'F', 'S']);
  await inArabic(() => expect(weekdayLetters()).toEqual(['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س']));
});

it('a percent: Home’s share memorized and Insights’ coverage', async () => {
  expect(formatPercentage(87)).toBe('87%');
  expect(formatPercentage(50.5, 1)).toBe('50.5%');
  await inArabic(() => {
    expect(formatPercentage(87)).toBe('٨٧٪');
    expect(formatPercentage(50.5, 1)).toBe('٥٠٫٥٪');
  });
});

it('Insights’ busiest hours, its pace, and a time spent', async () => {
  expect(hourRange(5, 7)).toBe('5–7 AM');
  expect(hourRange(11, 13)).toBe('11 AM–1 PM');
  expect(formatPace(1.8)).toBe('1.8');
  expect(formatDuration(18 * 60)).toBe('18m');
  expect(formatDuration(65 * 60)).toBe('1h 5m');
  await inArabic(() => {
    expect(hourRange(5, 7)).toBe('٥–٧ ص');
    expect(hourRange(11, 13)).toBe('١١ ص–١ م');
    expect(formatPace(1.8)).toBe('١٫٨');
    expect(formatDuration(18 * 60)).toBe('١٨ د');
    expect(formatDuration(65 * 60)).toBe('١ س ٥ د');
  });
});

it('surah names in the app’s language: Activity’s day and the mushaf’s scrubber', async () => {
  expect(describeSurahs({ first: 562, last: 564 })).toBe('Al-Mulk to Al-Qalam');
  expect(scrubberPreview(293).surahs).toBe('Al-Isra / Al-Kahf');
  await inArabic(() => {
    expect(describeSurahs({ first: 562, last: 564 })).toBe('من الملك إلى القلم');
    expect(scrubberPreview(293).surahs).toBe('الإسراء / الكهف');
  });
});
