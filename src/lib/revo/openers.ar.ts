// Revo's first line by where it was opened (REVO-38), in Arabic: openers.ts's sentence builders written again for
// Arabic, over the same facts. The English builds its sentences from parts (a day's "on"/bare forms, "both pages",
// "you" added or not) that don't carry over, so each sentence is Arabic from the start, with Arabic number-and-noun
// agreement (src/i18n/ar-glossary.md). Passages, surah names, the hello, the asides and "twice" come from the app's
// own Arabic (lib/passages, lib/revo/greeting, lib/recency).

import { placeOfPage } from '../passages';
import { shiftDay } from '../journal';
import { timesWord } from '../recency';
import { daysBetween } from './facts';
import { todayDone } from './greeting';
import type { RevoContext } from './types';
import { passageLong, passageShort } from './words';
import { formatDate, formatNumber, weekdayName } from '../../i18n';
import type { Built, Line, PlaceFacts } from './openers';

const NBSP = ' ';
const rules = new Intl.PluralRules('ar');

/** A noun's forms after a number: none, one, two (as subject, as object), 3–10, 11–99, 100 and up. */
interface Noun {
  zero: string;
  one: string;
  two: [string, string];
  few: string;
  many: string;
  other: string;
}
const PAGE: Noun = { zero: 'لا صفحات', one: 'صفحة واحدة', two: ['صفحتان', 'صفحتين'], few: 'صفحات', many: 'صفحة', other: 'صفحة' };
const WEAK_PAGE: Noun = { zero: 'لا صفحات ضعيفة', one: 'صفحة ضعيفة واحدة', two: ['صفحتان ضعيفتان', 'صفحتين ضعيفتين'], few: 'صفحات ضعيفة', many: 'صفحة ضعيفة', other: 'صفحة ضعيفة' };
const DAY: Noun = { zero: 'لا أيام', one: 'يوم واحد', two: ['يومان', 'يومين'], few: 'أيام', many: 'يومًا', other: 'يوم' };
const MINUTE: Noun = { zero: 'لا دقائق', one: 'دقيقة واحدة', two: ['دقيقتان', 'دقيقتين'], few: 'دقائق', many: 'دقيقة', other: 'دقيقة' };
const NOTE: Noun = { zero: 'لا ملاحظات', one: 'ملاحظة واحدة', two: ['ملاحظتان', 'ملاحظتين'], few: 'ملاحظات', many: 'ملاحظة', other: 'ملاحظة' };

/** "٢٨ صفحة", "صفحتان", "٣ أيام": the number in Arabic-Indic digits with its noun's form. `object`: after a verb or a preposition. */
function count(n: number, noun: Noun, object = false): string {
  const form = n === 0 ? 'zero' : rules.select(n);
  if (form === 'zero') return noun.zero;
  if (form === 'one') return noun.one;
  if (form === 'two') return noun.two[object ? 1 : 0];
  const word = form === 'few' ? noun.few : form === 'many' ? noun.many : noun.other;
  return `${formatNumber(n)}${NBSP}${word}`;
}

const juzName = (juz: number) => `الجزء${NBSP}${formatNumber(juz)}`;
const weekdayOf = (day: string) => weekdayName(new Date(`${day}T12:00:00`));
const dateOf = (day: string) => formatDate(new Date(`${day}T12:00:00`), { weekday: 'long', day: 'numeric', month: 'long' }, 'device');

/** A day as Arabic names it from today: «أمس», «يوم الثلاثاء» (within a week), else «يوم الأحد، ٨ نوفمبر». */
function dayWords(day: string, today: string): { name: string; on: string; ask: string; near: boolean } {
  const k = daysBetween(today, day);
  if (k === -1) return { name: 'أمس', on: 'أمس', ask: 'أمس', near: true };
  if (k === 1) return { name: 'غدًا', on: 'غدًا', ask: 'الغد', near: true };
  if (Math.abs(k) <= 6) {
    const w = weekdayOf(day);
    return { name: w, on: `يوم ${w}`, ask: w, near: true };
  }
  const d = dateOf(day);
  return { name: d, on: `يوم ${d}`, ask: 'ذلك اليوم', near: false };
}

/** When something was last revised: «اليوم», «أمس», «يوم الأحد», «قبل ٤١ يومًا». */
function lastWhen(daysAgo: number, today: string): string {
  if (daysAgo <= 0) return 'اليوم';
  if (daysAgo === 1) return 'أمس';
  if (daysAgo <= 6) return `يوم ${weekdayOf(shiftDay(today, -daysAgo))}`;
  return `قبل ${count(daysAgo, DAY, true)}`;
}

const lastWhenFromFacts = (daysAgo: number) => (daysAgo <= 0 ? 'اليوم' : daysAgo === 1 ? 'أمس' : `قبل ${count(daysAgo, DAY, true)}`);

const todayOf = (ctx: RevoContext) => ctx.week[ctx.week.length - 1]?.day ?? '';

const PACE = 'كيف وتيرتي؟';
const WEEK = 'كيف كان أسبوعي؟';
const MISS = 'ما الأيام التي تفوتني؟';
const AHEAD = 'هل يمكنني المراجعة مسبقًا؟';
const WEAKEST = 'ما أضعف المواضع؟';
const JUZ_BY_LAST = 'اعرض أجزائي حسب آخر مراجعة';
const plan = (what: string) => `خطة لمراجعة ${what}`;

/** Today's next part, while today isn't done: «اليوم، التالي: البقرة، الآيات ٢٠٣–٢١٩.» */
export function todayTail(ctx: RevoContext): Line | null {
  if (ctx.today.plannedPages === 0 || todayDone(ctx)) return null;
  const next = ctx.today.nextPages.slice(0, 2);
  if (next.length === 0) return null;
  return { text: `اليوم، التالي: ${passageLong(next, { sentence: true })}.` };
}

export function dayLine(f: Extract<PlaceFacts, { kind: 'day' }>, ctx: RevoContext): Built {
  const when = dayWords(f.day, f.today);
  if (f.facts == null) {
    const lead = f.plan.length === 0 ? `لا شيء في الخطة ${when.on}.` : `في الخطة ${when.on} ${count(f.plan.length, PAGE)}، تبدأ من ${placeOfPage(f.plan[0])}.`;
    return { lead, second: null, turns: [], chips: [AHEAD, PACE] };
  }
  const { plan: dayPlan, revised, minutes, notes, memorized } = f.facts;
  const mins = revised.pages > 0 && minutes ? `، في ${count(minutes, MINUTE, true)}` : '';
  const noteCount = notes?.length ?? 0;
  const wrote = noteCount > 0 ? `، وكتبت ${count(noteCount, NOTE, true)}` : '';
  const how = `كيف كانت مراجعة ${when.ask}؟`;
  let lead: string;
  let chips: (string | null)[];
  if (dayPlan && dayPlan.pages > 0) {
    const name = passageLong(f.plan);
    const done = dayPlan.pages - dayPlan.notDone;
    if (dayPlan.notDone === 0 && dayPlan.onDay === dayPlan.pages) {
      lead = `${when.on} راجعت كل ما في الخطة: ${count(dayPlan.pages, PAGE)}، ${name}${mins}${wrote}.`;
    } else if (dayPlan.notDone === 0) {
      const parts = [
        dayPlan.late > 0 ? `${formatNumber(dayPlan.late)} استُدركت لاحقًا` : '',
        dayPlan.ahead > 0 ? `${formatNumber(dayPlan.ahead)} رُوجعت مسبقًا` : '',
      ].filter(Boolean);
      lead = `${when.on} رُوجع كل ما في الخطة: ${count(dayPlan.pages, PAGE)}، ${name}، منها ${parts.join(' و')}${wrote}.`;
    } else if (done === 0 && revised.pages === 0) {
      const whose = when.near ? `صفحات ${when.name} (${count(dayPlan.pages, PAGE)})` : `الصفحات المخططة ${when.on} (${count(dayPlan.pages, PAGE)})`;
      lead = `${whose}، ${name}، لم تُراجَع${wrote}.`;
    } else {
      lead = `${when.on} راجعت ${formatNumber(done)} من ${count(dayPlan.pages, PAGE, true)}، ${name}${mins}${wrote}.`;
    }
    const missed = dayPlan.notDone > 0;
    // Missed pages are offered for three days (DAY rules): only then is catching up a question.
    const catchUp = missed && daysBetween(f.day, f.today) <= 3 ? `هل يمكنني استدراك ${when.ask}؟` : null;
    chips = !missed ? [how, WEEK, MISS] : done > 0 ? [catchUp ?? how, MISS, PACE] : [catchUp, MISS, PACE, WEEK];
  } else if (revised.pages > 0) {
    lead = `${when.on} راجعت ${count(revised.pages, PAGE, true)}، ${passageLong(f.revised)}${mins}${wrote}.`;
    chips = [how, WEEK, PACE];
  } else if (memorized.pages > 0) {
    lead = `${when.on} حفظت ${count(memorized.pages, PAGE, true)}${wrote}.`;
    chips = [WEEK, PACE];
  } else {
    lead = `لم تُراجَع أي صفحة ${when.on}${wrote}.`;
    chips = [MISS, WEEK];
  }
  return { lead, second: todayTail(ctx), turns: [], chips };
}

export function overviewLine(f: Extract<PlaceFacts, { kind: 'overview' }>, ctx: RevoContext): Built {
  const { daysRevised, daysSoFar, pages } = f;
  let lead: string;
  if (daysRevised === 0) lead = 'لم تراجع بعد هذا الشهر.';
  else if (daysSoFar <= 1) lead = `راجعت حتى الآن هذا الشهر ${count(pages, PAGE, true)}.`;
  else if (daysRevised >= daysSoFar) lead = `راجعت هذا الشهر كل يوم، ${count(pages, PAGE)} إجمالًا.`;
  else lead = `راجعت هذا الشهر في ${formatNumber(daysRevised)} من ${count(daysSoFar, DAY, true)}، ${count(pages, PAGE)} إجمالًا.`;
  return { lead, second: todayTail(ctx), turns: [], chips: [MISS, WEEK, PACE] };
}

function coverageLine(ctx: RevoContext): Line | null {
  const memorized = ctx.totals.memorizedPages;
  if (memorized <= 0) return null;
  const percent = Math.min(100, Math.round((ctx.totals.revisedWithin30Days / memorized) * 100));
  return { text: `خلال آخر ثلاثين يومًا راجعت ${formatNumber(percent)}٪ مما حفظته.`, chip: 'ما المواضع التي لم أراجعها مؤخرًا؟' };
}

function paceLine(ctx: RevoContext): Line | null {
  const { pagesPerDay30, plannedPerDay, memorizedPages } = ctx.totals;
  if (memorizedPages <= 0) return null;
  const perDay = pagesPerDay30 > 0 && pagesPerDay30 < 1 ? 'أقل من صفحة في اليوم' : `${count(Math.round(pagesPerDay30), PAGE, true)} في اليوم`;
  const against = plannedPerDay > 0 ? `، والخطة ${formatNumber(plannedPerDay)}` : '';
  return { text: `خلال آخر ثلاثين يومًا راجعت ${perDay}${against}.`, chip: PACE };
}

export function insightLines(f: Extract<PlaceFacts, { kind: 'insights' }>, ctx: RevoContext): { lines: Line[]; chips: (string | null)[] }[] {
  const out: { lines: Line[]; chips: (string | null)[] }[] = [];
  if (f.weak) {
    const name = passageLong(f.weak.pages);
    const only = ctx.weakPages.length <= f.weak.pages.length;
    const when = f.weak.daysAgo == null ? 'ولم تُراجَع بعد' : `وآخر مراجعة لها ${lastWhen(f.weak.daysAgo, todayOf(ctx))}`;
    out.push({
      lines: [{ text: `${name} مقيّمة ضعيفة ${when}${only ? '' : '، وهي الأطول دون مراجعة بين مواضع ضعفك'}.` }, { text: 'أتريد خطة قصيرة لها؟' }],
      chips: [plan(passageShort(f.weak.pages)), WEAKEST, PACE],
    });
  } else if (f.stalest) {
    const { juz, daysAgo, juzCount } = f.stalest;
    if (daysAgo != null && daysAgo <= 7) {
      out.push({ lines: [{ text: 'كل جزء حفظته رُوجع خلال آخر سبعة أيام.' }], chips: [JUZ_BY_LAST, PACE] });
    } else {
      const text =
        daysAgo == null
          ? `${juzName(juz)} لم يُراجَع بعد.`
          : `${juzName(juz)} لم يأتِ دوره منذ ${count(daysAgo, DAY, true)}${juzCount > 1 ? '، وهو الأطول بين أجزائك' : ''}.`;
      out.push({ lines: [{ text }], chips: [`متى يأتي دور ${juzName(juz)} التالي؟`, JUZ_BY_LAST, PACE] });
    }
  }
  const coverage = coverageLine(ctx);
  if (coverage) out.push({ lines: [coverage], chips: [coverage.chip ?? null, PACE, MISS] });
  const pace = paceLine(ctx);
  if (pace) out.push({ lines: [pace], chips: [PACE, MISS, WEEK] });
  return out;
}

export function weakLine(f: Extract<PlaceFacts, { kind: 'weak' }>): Built {
  if (f.count === 0) return { lead: 'لا توجد لديك صفحات مقيّمة ضعيفة الآن.', second: null, turns: [], chips: [WEAKEST, PACE] };
  const where = f.mostIn ? (f.count === 1 ? `، في ${f.mostIn}` : `، أكثرها في ${f.mostIn}`) : '';
  if (f.from === 'weakSpots') {
    return {
      lead: `لديك ${count(f.count, WEAK_PAGE)}${where}.`,
      second: { text: 'اسأل عنها، أو أضع لها خطة.' },
      turns: [],
      chips: ['خطة لمواضع ضعفي', 'لماذا تضعف؟'],
    };
  }
  const longest = f.longest.length > 0 ? passageLong(f.longest) : null;
  return {
    lead: `${count(f.count, PAGE)} مقيّمة ضعيفة${where}.`,
    second: longest && f.count > 1 ? { text: `الأطول دون مراجعة منها ${longest}.` } : null,
    turns: [],
    chips: [longest ? plan(passageShort(f.longest)) : 'خطة لمواضع ضعفي', 'لماذا تضعف؟'],
  };
}

export function juzLine(f: Extract<PlaceFacts, { kind: 'juz' }>, strength: boolean): Built {
  const { juz, facts } = f;
  const name = juzName(juz);
  if (facts.memorized === 0) {
    return { lead: `لم تحفظ شيئًا من ${name} بعد.`, second: null, turns: [], chips: [`ما في ${name}؟`, PACE] };
  }
  const all = facts.memorized >= facts.pages;
  const subject = all ? `${name} محفوظ كله` : `حفظت ${formatNumber(facts.memorized)} من ${count(facts.pages, PAGE, true)} في ${name}`;
  const days = facts.revised.last30.days;
  const ago = facts.lastRevisedDaysAgo;
  let lead: string;
  if (ago == null) lead = `${subject}، ولم ${all ? 'يُراجَع' : 'تُراجَع'} بعد.`;
  else if (days > 0) lead = `${subject}، رُوجع ${timesWord(days)} خلال آخر ثلاثين يومًا، آخرها ${lastWhenFromFacts(ago)}.`;
  else lead = `${subject}، ولم يُراجَع خلال آخر ثلاثين يومًا، وآخر مراجعة قبل ${count(ago, DAY, true)}.`;
  const weak = strength ? facts.strength.weak : 0;
  const second: Line | null = weak > 0 ? { text: weak === 1 ? 'صفحة واحدة منه مقيّمة ضعيفة.' : `${count(weak, PAGE)} منه مقيّمة ضعيفة.` } : null;
  const next = facts.next;
  const turns: Line[] = next
    ? [{ text: `يأتي دوره التالي ${next.inDays === 1 ? 'غدًا' : `بعد ${count(next.inDays, DAY, true)}`}، ${count(next.pages, PAGE)}.` }]
    : [];
  return {
    lead,
    second,
    turns,
    chips: [`كيف حال ${name}؟`, `متى يأتي دور ${name} التالي؟`, weak > 0 ? `خطة لصفحات ${name} الضعيفة` : null],
  };
}
