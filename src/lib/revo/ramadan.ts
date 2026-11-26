// Revo in Ramadan (BEHAVIOUR.md THEME-8, Revisely Dev, with the theme showing): the month so far as context the model
// can plan from, and the greeting and suggestions it opens with. The figures are lib/ramadanStats', the same as Insights'
// Ramadan row and the end card.

import type { ReadingSession, RevisionLog } from '../../types';
import { plainText, placeOfPage } from '../passages';
import { daysBetween } from '../dayKeys';
import type { RamadanDates, RamadanPhase } from '../ramadanDates';
import { QURAN_PAGES, ramadanStats } from '../ramadanStats';
import { t } from '../../i18n';
import { revoHello } from './greeting';
import type { Opener } from './openers';
import type { RevoRamadan } from './types';

/** The month so far, for the model: today's day, days revised, and the pages through the Qur'an since 1 Ramadan. */
export function revoRamadan(
  logs: readonly Pick<RevisionLog, 'date' | 'pagesRevised' | 'durationMinutes'>[],
  readings: readonly Pick<ReadingSession, 'date' | 'pages' | 'pagesVisited' | 'durationSeconds'>[],
  dates: RamadanDates,
  today: string,
): RevoRamadan | null {
  const length = daysBetween(dates.start, dates.eid);
  const day = daysBetween(dates.start, today) + 1;
  if (day < 1 || day > length) return null;
  const s = ramadanStats(logs, readings, dates, today);
  // The first page not yet revised or read since 1 Ramadan: where a khatmah goes on from.
  const seen = new Set<number>();
  for (const l of logs) if (daysBetween(dates.start, l.date) >= 0 && daysBetween(l.date, today) >= 0) l.pagesRevised.forEach((p) => seen.add(p));
  for (const r of readings) {
    if (daysBetween(dates.start, r.date) < 0 || daysBetween(r.date, today) < 0) continue;
    (r.pages.length > 0 ? r.pages : (r.pagesVisited ?? [])).forEach((p) => seen.add(p));
  }
  let next = 0;
  for (let p = 1; p <= QURAN_PAGES; p++) {
    if (!seen.has(p)) {
      next = p;
      break;
    }
  }
  return {
    day,
    length,
    revisedDays: s.revisedDays.length,
    covered: s.covered,
    ...(next > 0 ? { nextPage: next, nextWords: plainText(placeOfPage(next)) } : {}),
  };
}

/**
 * Revo's first line and suggestions in Ramadan: "Ramadan Kareem, Majd." (on Eid's days "Eid Mubarak, Majd.") in place of
 * "Assalamu alaikum, Majd.", and during the month, opened from Home, the Ramadan suggestions. Opened from a screen's
 * part (a day, an insight), the suggestions stay that part's.
 */
export function ramadanOpener(opener: Opener, name: string | null, phase: RamadanPhase | null, atPlace: boolean): Opener {
  if (!phase || (phase.kind !== 'during' && phase.kind !== 'eid')) return opener;
  const hello = revoHello(name);
  const ramadanHello =
    phase.kind === 'during'
      ? name
        ? t('revo.ramadan.hello', { name })
        : t('revo.ramadan.helloNoName')
      : name
        ? t('revo.ramadan.eid', { name })
        : t('revo.ramadan.eidNoName');
  const text = opener.text.startsWith(hello) ? ramadanHello + opener.text.slice(hello.length) : opener.text;
  const chips =
    phase.kind === 'during' && !atPlace ? [t('revo.ramadan.khatmahChip'), t('revo.ramadan.taraweehChip'), t('revo.ramadan.howChip')] : opener.chips;
  return { text, chips };
}
