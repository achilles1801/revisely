// The app's strings and formats (src/i18n/README.md):
//   t('updates.ready.title')                      "A new update is ready"
//   t('updates.store.body', { version, store })   "Revisely 1.0.4 is on the App Store."
//   dayMonth(date, { weekday: 'long' })           "Wednesday 28 October"
export { i18n, t, currentLanguage } from './instance';
export {
  dateLocale,
  numberLocale,
  formatDate,
  formatDay,
  formatTime,
  formatNumber,
  formatNumeral,
  weekdayName,
  monthName,
  dayMonth,
} from './format';
export type { EnglishLocale } from './format';
