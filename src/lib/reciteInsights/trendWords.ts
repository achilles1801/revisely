// What Recitation's own page says (pure; Revisely Dev, ACT-42): mistakes a page to a tenth, its trend against the period
// before, a bar's line, fixed against still slipping, and how long the takes are, in words people use ("Usually 1½ pages,
// about 6 minutes"). Strings: src/i18n/en/reciteInsights.ts, `page`.

import { currentLanguage, dayMonth, formatNumber, monthName, t } from '../../i18n';
import { daysSince } from '../recency';
import { dayWords } from './describe';
import { type ChartSpan, type FixedSlipping, type KindBar, type KindKey, type Rate, type TakeLengths, perPage } from './trend';

/** Mistakes a page to a tenth, as people read it: "0.5", "2", "<0.1" for a slip or two over many pages; "0" for none. */
export function perPageText(rate: number): string {
  if (rate <= 0) return formatNumber(0);
  const tenths = Math.round(rate * 10) / 10;
  if (tenths <= 0) return t('reciteInsights.page.under', { n: formatNumber(0.1, { minimumFractionDigits: 1 }) });
  return formatNumber(tenths, { maximumFractionDigits: 1 });
}

/** The trend against the period before: better (fewer a page), worse, or the same to a tenth; none with nothing before. */
export interface TrendChip {
  dir: 'down' | 'up' | 'same';
  text: string;
}

export function trendChip(now: Rate, before: Rate | null): TrendChip | null {
  const a = perPage(now);
  const b = before ? perPage(before) : null;
  if (a === null || b === null) return null;
  const then = perPageText(b);
  if (perPageText(a) === then) return { dir: 'same', text: t('reciteInsights.page.same') };
  return { dir: a < b ? 'down' : 'up', text: t('reciteInsights.page.from', { n: then }) };
}

/** Under the figure: "40 takes · 98.8% of words said right · last 3 months against the 3 months before". */
export function heroLine(takes: number, right: string | null, lastWords: string, before: string | null): string {
  const n = t('reciteInsights.takes', { count: takes, n: formatNumber(takes) });
  const span = before ? t('reciteInsights.page.against', { last: lastWords, before }) : lastWords;
  return right ? t('reciteInsights.page.line', { takes: n, right, span }) : t('reciteInsights.page.lineNoScore', { takes: n, span });
}

export const kindName = (k: KindKey): string => t(`reciteInsights.page.kind.${k}`);
const kindLower = (k: KindKey): string => t(`reciteInsights.page.kindLower.${k}`);

/** The chart's title and its pills' words. */
export const chartTitle = (span: ChartSpan): string => t(span === '1y' ? 'reciteInsights.page.byMonth' : 'reciteInsights.page.byWeek');
const SPAN_KEY = { '4w': 'fourWeeks', '3m': 'threeMonths', '1y': 'year' } as const;
export const spanLabel = (span: ChartSpan): string => t(`reciteInsights.page.span.${SPAN_KEY[span]}`);
/** "in the last 4 weeks", for a span with no takes. */
export const spanIn = (span: ChartSpan): string => t(`reciteInsights.page.spanIn.${SPAN_KEY[span]}`);

/** A bar by its week or month: "Week of 2 Nov", "This week", "November". */
export function barWhen(b: Pick<KindBar, 'from' | 'month'>, last: boolean): string {
  if (b.month) return monthName(new Date(`${b.from}T12:00:00Z`), 'long', 'UTC');
  if (last) return t('reciteInsights.thisWeek');
  return t('reciteInsights.page.weekOf', { day: dayMonth(new Date(`${b.from}T12:00:00`), { month: 'short' }) });
}

/** Under a bar: "2 Nov" (its Monday), "This wk"; a month's short name. */
export function barLabel(b: Pick<KindBar, 'from' | 'month'>, last: boolean): string {
  if (b.month) return monthName(new Date(`${b.from}T12:00:00Z`), 'short', 'UTC');
  if (last) return t('reciteInsights.page.thisWk');
  return dayMonth(new Date(`${b.from}T12:00:00`), { month: 'short' });
}

/** A bar's value: all its mistakes a page, or one kind's when that kind is shown alone. */
export function barValue(b: Rate, alone: KindKey | null): number | null {
  if (b.pages <= 0) return null;
  return (alone ? b.kinds[alone] : b.mistakes) / b.pages;
}

/** The line above the chart for the bar lit: "Week of 2 Nov · 0.7 a page", "… · no mistakes", "… · no takes". */
export function barLine(b: KindBar, last: boolean, alone: KindKey | null): string {
  const when = barWhen(b, last);
  const v = barValue(b, alone);
  if (v === null) return t('reciteInsights.page.valueNoTakes', { when });
  if (v <= 0) return alone ? t('reciteInsights.page.valueNoKind', { when, kind: kindLower(alone) }) : t('reciteInsights.page.valueNone', { when });
  return alone ? t('reciteInsights.page.valueKind', { when, n: perPageText(v), kind: kindLower(alone) }) : t('reciteInsights.page.value', { when, n: perPageText(v) });
}

/** What VoiceOver says for a bar: "Week of 2 Nov: 0.7 mistakes a page, 3 takes". */
export function barSpoken(b: KindBar, last: boolean, alone: KindKey | null): string {
  const when = barWhen(b, last);
  const v = barValue(b, alone);
  if (v === null) return t('reciteInsights.page.spokenNoTakes', { when });
  const takes = t('reciteInsights.takes', { count: b.takes, n: formatNumber(b.takes) });
  return t('reciteInsights.page.spoken', { when, n: perPageText(v), takes, kind: alone ? kindLower(alone) : t('reciteInsights.page.mistakesLower') });
}

/** The two tiles and the line under the share bar. */
export function fixedTile(f: FixedSlipping, inTheLast: string): string {
  if (f.fixed === 0) return t('reciteInsights.page.fixedNone');
  const what = t('reciteInsights.page.fixedWhat', { count: f.fixed });
  return f.fixedInRange > 0 ? t('reciteInsights.page.fixedSome', { what, n: formatNumber(f.fixedInRange), when: inTheLast }) : what;
}

export function slippingTile(f: FixedSlipping, inTheLast: string): string {
  if (f.slipping === 0) return t('reciteInsights.page.slipNone');
  const passages = t('reciteInsights.page.passages', { count: f.passages, n: formatNumber(f.passages) });
  const what = t('reciteInsights.page.slipWhat', { count: f.slipping, passages });
  return f.newInRange > 0 ? t('reciteInsights.page.slipNew', { what, n: formatNumber(f.newInRange), when: inTheLast }) : what;
}

export function shareLine(f: FixedSlipping): string {
  const total = f.fixed + f.slipping;
  return t('reciteInsights.page.share', { count: total, fixed: formatNumber(f.fixed), total: formatNumber(total) });
}

/** A length in pages as people say it: "5 lines" under a page, else to a half ("1½ pages", "4 pages"). */
export function pagesWords(pages: number): string {
  if (pages < 0.95) {
    const lines = Math.max(1, Math.round(pages * 15));
    return t('reciteInsights.page.lines', { count: lines, n: formatNumber(lines) });
  }
  const halves = Math.round(pages * 2) / 2;
  const whole = Math.floor(halves);
  const half = halves !== whole;
  // English writes a half as "1½"; Arabic as a decimal in its own digits ("١٫٥").
  if (!half) return t('reciteInsights.page.pagesN', { count: whole, n: formatNumber(whole) });
  return t('reciteInsights.page.pagesHalf', { n: currentLanguage() === 'ar' ? formatNumber(halves, { maximumFractionDigits: 1 }) : `${whole}½` });
}

/** "about 6 minutes", "under a minute". */
export function minutesWords(secs: number): string {
  const mins = Math.round(secs / 60);
  if (mins < 1) return t('reciteInsights.page.underMinute');
  return t('reciteInsights.page.aboutMinutes', { count: mins, n: formatNumber(mins) });
}

/** Your takes' row: its title and its line. */
export function takesTitle(l: TakeLengths): string {
  const pages = pagesWords(l.pages);
  const time = minutesWords(l.secs);
  return l.takes === 1 ? t('reciteInsights.page.oneTake', { pages, time }) : t('reciteInsights.page.usually', { pages, time });
}

export function takesLine(l: TakeLengths, today: string): string {
  const parts: string[] = [];
  if (l.takes > 1) {
    const n = Math.max(0, daysSince(l.longest.day, today));
    const when = n >= 2 && n < 7 ? t('reciteInsights.onDay', { day: dayWords(l.longest.day, today) }) : n < 2 ? dayWords(l.longest.day, today) : t('reciteInsights.onDay', { day: dayMonth(new Date(`${l.longest.day}T12:00:00`), { month: 'short' }) });
    parts.push(t('reciteInsights.page.longest', { pages: pagesWords(l.longest.pages), when }));
  }
  const long = l.long ? perPage(l.long) : null;
  const short = l.short ? perPage(l.short) : null;
  if (long !== null && short !== null) parts.push(t('reciteInsights.page.longShort', { long: perPageText(long), short: perPageText(short) }));
  return parts.join(' ');
}
