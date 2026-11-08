// Revo's first line by where it was opened (REVO-38), written on the phone like Home's greeting
// (REVO-20): no call, nothing counted, surahs and juz first, nothing about strength without Smart
// Tracking. Home, See all and today's own day open on Home's greeting (lib/revo/greeting). Elsewhere
// the line is about what was on screen: a day, the month, what stands out in Insights, the weak
// pages, a juz. A day's and the Overview's line end with today's next part while today isn't done.
// Opened again from the same place with nothing changed, its second sentence takes turns (REVO-35).

import { surahName, placeOfPage } from '../passages';
import { shiftDay } from '../journal';
import { isRevisable } from '../memorizedAyahs';
import { getJuzForPage, getSurahForPage } from '../quranData';
import { timesWord } from '../recency';
import { juzPages } from './attachments';
import { dayFacts, daysBetween, passageFacts, type Prepared } from './facts';
import { asides, revoChips, revoGreeting, todayDone, type Aside, type GreetingExtras } from './greeting';
import type { RevoPlace } from './place';
import type { RevoContext, RevoDayFacts, RevoPassageFacts } from './types';
import { passageLong, passageShort } from './words';

const NBSP = ' ';
const juzName = (juz: number) => `Juz${NBSP}${juz}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n}${NBSP}${n === 1 ? one : many}`;

/** What the line says about the place, worked out from the account's data when Revo opens. */
export type PlaceFacts =
  | {
      kind: 'day';
      day: string;
      today: string;
      /** Null for a day ahead (nothing has happened on it). */
      facts: RevoDayFacts | null;
      /** Its plan's pages (as the streak reads the plan) and the pages revised on it. */
      plan: readonly number[];
      revised: readonly number[];
    }
  | { kind: 'overview'; daysRevised: number; daysSoFar: number; pages: number }
  | {
      kind: 'insights';
      /** Smart Tracking: the weak part left longest, and days since it was revised (null: never). */
      weak: { pages: number[]; daysAgo: number | null } | null;
      /** The memorized juz revised longest ago (null days: never), and how many juz have memorized pages. */
      stalest: { juz: number; daysAgo: number | null; juzCount: number } | null;
    }
  | { kind: 'weak'; from: 'weakSpots' | 'strength'; count: number; mostIn: string | null; longest: number[] }
  | { kind: 'juz'; juz: number; facts: RevoPassageFacts };

/** The last day each page was revised on, from the credits Activity and the streak read. */
function lastRevisedByPage(prepared: Prepared): Map<number, string> {
  const last = new Map<number, string>();
  for (const [day, pages] of prepared.index.revisedOn) {
    for (const p of pages) {
      const prev = last.get(p);
      if (prev == null || day > prev) last.set(p, day);
    }
  }
  return last;
}

/** The weak part left longest (the context lists weak pages oldest revised first), with the page after it if weak too. */
function weakLeftLongest(ctx: RevoContext): number[] {
  const first = ctx.weakPages[0];
  if (first == null) return [];
  return ctx.weakPages.includes(first + 1) ? [first, first + 1] : [first];
}

/** The surah most of these pages are in (a tie goes to the earlier one). */
function mostlyIn(pages: readonly number[]): string | null {
  const count = new Map<number, number>();
  for (const p of pages) {
    const s = getSurahForPage(p).number;
    count.set(s, (count.get(s) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [s, n] of count) if (best == null || n > count.get(best)! || (n === count.get(best)! && s < best)) best = s;
  return best == null ? null : surahName(best);
}

/**
 * The facts a place's line needs, from the same sources + attaches from (lib/revo/facts). Null where
 * Home's greeting is the line: Home, today's day, and the weak pages without Smart Tracking (they
 * say what Insights says instead).
 */
export function placeFacts(place: RevoPlace | null | undefined, prepared: Prepared, ctx: RevoContext, strength: boolean): PlaceFacts | null {
  if (!place) return null;
  const today = prepared.src.snapshot.day;
  switch (place.kind) {
    case 'day': {
      if (place.day === today) return null;
      const revised = [...(prepared.index.revisedOn.get(place.day) ?? [])].sort((a, b) => a - b);
      const plan = [...prepared.scheduled(place.day)].sort((a, b) => a - b);
      const facts = place.day > today ? null : dayFacts(place.day, prepared, place.extras ?? {});
      return { kind: 'day', day: place.day, today, facts, plan, revised };
    }
    case 'overview': {
      const month = today.slice(0, 7);
      let daysRevised = 0;
      let pages = 0;
      for (const [day, set] of prepared.index.revisedOn) {
        if (day.startsWith(month) && day <= today && set.size > 0) {
          daysRevised++;
          pages += set.size;
        }
      }
      return { kind: 'overview', daysRevised, daysSoFar: Number(today.slice(8, 10)), pages };
    }
    case 'weakSpots':
    case 'strength':
      if (strength) {
        return { kind: 'weak', from: place.kind, count: ctx.totals.weakPages, mostIn: mostlyIn(ctx.weakPages), longest: weakLeftLongest(ctx) };
      }
      return placeFacts({ kind: 'insights' }, prepared, ctx, strength);
    case 'insights': {
      const last = lastRevisedByPage(prepared);
      let weak: { pages: number[]; daysAgo: number | null } | null = null;
      const part = strength ? weakLeftLongest(ctx) : [];
      if (part.length > 0) {
        const newest = part.map((p) => last.get(p)).filter((d): d is string => d != null).sort().pop();
        weak = { pages: part, daysAgo: newest == null ? null : daysBetween(newest, today) };
      }
      // Each memorized juz is as recent as its most recently revised memorized page (the juz sheet's "Last revised").
      const byJuz = new Map<number, string | null>();
      for (const page of prepared.src.pages) {
        if (!isRevisable(page)) continue;
        const juz = getJuzForPage(page.pageNumber);
        const d = last.get(page.pageNumber) ?? null;
        const prev = byJuz.get(juz);
        byJuz.set(juz, prev === undefined ? d : prev == null ? d : d == null ? prev : d > prev ? d : prev);
      }
      let stalest: { juz: number; daysAgo: number | null; juzCount: number } | null = null;
      for (const [juz, d] of [...byJuz].sort((a, b) => a[0] - b[0])) {
        const daysAgo = d == null ? null : daysBetween(d, today);
        const older = stalest == null || (stalest.daysAgo != null && (daysAgo == null || daysAgo > stalest.daysAgo));
        if (older) stalest = { juz, daysAgo, juzCount: byJuz.size };
      }
      return { kind: 'insights', weak, stalest };
    }
    case 'juz':
      return { kind: 'juz', juz: place.juz, facts: passageFacts(juzPages(place.juz), prepared) };
    default:
      return null;
  }
}

/** One sentence and the suggestion that goes with it. */
interface Line {
  text: string;
  chip?: string | null;
}

/** What a place's line is made of: its lead, the sentence after it, and what takes that sentence's turn when opened again. */
interface Built {
  lead: string;
  second: Line | null;
  /** The second sentence's turns (REVO-35), from the second open on. */
  turns: Line[];
  chips: (string | null | undefined)[];
}

const weekdayOf = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
const dateOf = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });

/** How a day is named from today: "Yesterday", "Tuesday" (within a week), else its date. */
function dayWords(day: string, today: string): { name: string; on: string; bare: string; near: boolean } {
  const k = daysBetween(today, day);
  if (k === -1) return { name: 'Yesterday', on: 'Yesterday', bare: 'yesterday', near: true };
  if (k === 1) return { name: 'Tomorrow', on: 'Tomorrow', bare: 'tomorrow', near: true };
  if (Math.abs(k) <= 6) {
    const w = weekdayOf(day);
    return { name: w, on: `On ${w}`, bare: k < 0 ? `on ${w}` : w, near: true };
  }
  const d = dateOf(day);
  return { name: d, on: `On ${d}`, bare: `on ${d}`, near: false };
}

/** When something was last revised, for the end of a sentence: "today", "yesterday", "on Sunday", "41 days ago". */
function lastWhen(daysAgo: number, today: string): string {
  if (daysAgo <= 0) return 'today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo <= 6) return `on ${weekdayOf(shiftDay(today, -daysAgo))}`;
  return `${daysAgo}${NBSP}days ago`;
}

/** Today's next part, while today isn't done: "Today, Al-Baqarah, ayahs 203–219 is next." */
function todayTail(ctx: RevoContext): Line | null {
  if (ctx.today.plannedPages === 0 || todayDone(ctx)) return null;
  const next = ctx.today.nextPages.slice(0, 2);
  if (next.length === 0) return null;
  return { text: `Today, ${passageLong(next, { sentence: true })} is next.` };
}

/** The turns a place's second sentence takes when opened again: the week, the streak, the share memorized. */
function placeTurns(ctx: RevoContext, extras: GreetingExtras): Line[] {
  const all = asides(ctx, extras);
  const order: Aside['kind'][] = ['week', 'streak', 'memorized'];
  return order.flatMap((k) => all.filter((a) => a.kind === k)).map((a) => ({ text: a.text, chip: a.chip }));
}

function dayLine(f: Extract<PlaceFacts, { kind: 'day' }>, ctx: RevoContext): Built {
  const when = dayWords(f.day, f.today);
  // A day ahead: its pages and where they start.
  if (f.facts == null) {
    if (f.plan.length === 0) return { lead: `Nothing is planned for ${when.bare}.`, second: null, turns: [], chips: ['Can I revise ahead?', 'How is my pace?'] };
    return {
      lead: `${when.name} is ${plural(f.plan.length, 'page')}, starting at ${placeOfPage(f.plan[0])}.`,
      second: null,
      turns: [],
      chips: ['Can I revise ahead?', 'How is my pace?'],
    };
  }
  const { plan, revised, minutes, notes, memorized } = f.facts;
  const ask = when.near ? when.bare.replace(/^on /, '') : 'that day';
  const mins = revised.pages > 0 && minutes ? `, in ${plural(minutes, 'minute')}` : '';
  const noteCount = notes?.length ?? 0;
  const wrote = (active: boolean) => (noteCount > 0 ? `, and ${active ? '' : 'you '}wrote ${plural(noteCount, 'note')}` : '');
  let lead: string;
  let chips: (string | null)[];
  if (plan && plan.pages > 0) {
    const name = passageLong(f.plan);
    const done = plan.pages - plan.notDone;
    // "all 28 pages", "both pages", "its page".
    const every = plan.pages === 1 ? 'its page' : plan.pages === 2 ? 'both pages' : `all ${plural(plan.pages, 'page')}`;
    if (plan.notDone === 0 && plan.onDay === plan.pages) {
      lead = `${when.on} you revised ${every}, ${name}${mins}${wrote(true)}.`;
    } else if (plan.notDone === 0) {
      const how = [plan.late > 0 ? `${plan.late} caught up later` : '', plan.ahead > 0 ? `${plan.ahead} revised ahead` : ''].filter(Boolean).join(' and ');
      lead = `${when.on}, ${every}, ${name}, ${plan.pages === 1 ? 'was' : 'were'} revised, ${how}${wrote(false)}.`;
    } else if (done === 0 && revised.pages === 0) {
      const whose = when.near ? `${when.name}’s ${plural(plan.pages, 'page')}` : `The ${plural(plan.pages, 'page')} planned for ${when.name}`;
      lead = `${whose}, ${name}, weren’t revised${wrote(false)}.`;
    } else {
      lead = `${when.on} you revised ${done} of the day’s ${plural(plan.pages, 'page')}, ${name}${mins}${wrote(true)}.`;
    }
    const missed = plan.notDone > 0;
    // Missed pages are offered for three days (DAY rules): only then is catching up a question.
    const catchUp = missed && daysBetween(f.day, f.today) <= 3 ? `Can I still catch up ${ask}?` : null;
    chips = !missed
      ? [`How did ${ask} go?`, 'How was my week?', 'Which days do I miss?']
      : done > 0
        ? [catchUp ?? `How did ${ask} go?`, 'Which days do I miss?', 'How is my pace?']
        : [catchUp, 'Which days do I miss?', 'How is my pace?', 'How was my week?'];
  } else if (revised.pages > 0) {
    lead = `${when.on} you revised ${plural(revised.pages, 'page')}, ${passageLong(f.revised)}${mins}${wrote(true)}.`;
    chips = [`How did ${ask} go?`, 'How was my week?', 'How is my pace?'];
  } else if (memorized.pages > 0) {
    lead = `${when.on} you memorized ${plural(memorized.pages, 'page')}${wrote(true)}.`;
    chips = ['How was my week?', 'How is my pace?'];
  } else {
    lead = `Nothing was revised ${when.bare}${noteCount > 0 ? `, and you wrote ${plural(noteCount, 'note')}` : ''}.`;
    chips = ['Which days do I miss?', 'How was my week?'];
  }
  return { lead, second: todayTail(ctx), turns: [], chips };
}

function overviewLine(f: Extract<PlaceFacts, { kind: 'overview' }>, ctx: RevoContext): Built {
  const { daysRevised, daysSoFar, pages } = f;
  let lead: string;
  if (daysRevised === 0) lead = 'You haven’t revised yet this month.';
  else if (daysSoFar <= 1) lead = `You’ve revised ${plural(pages, 'page')} so far this month.`;
  else if (daysRevised >= daysSoFar) lead = `This month you’ve revised every day, ${plural(pages, 'page')} in all.`;
  else lead = `This month you’ve revised on ${daysRevised} of ${daysSoFar}${NBSP}days, ${plural(pages, 'page')} in all.`;
  return { lead, second: todayTail(ctx), turns: [], chips: ['Which days do I miss?', 'How was my week?', 'How is my pace?'] };
}

/** "In the last 30 days you've revised 92% of what you've memorized." */
function coverageLine(ctx: RevoContext): Line | null {
  const memorized = ctx.totals.memorizedPages;
  if (memorized <= 0) return null;
  const percent = Math.min(100, Math.round((ctx.totals.revisedWithin30Days / memorized) * 100));
  return { text: `In the last 30${NBSP}days you’ve revised ${percent}% of what you’ve memorized.`, chip: 'Which parts haven’t I revised lately?' };
}

/** "Over the last 30 days you've revised 18 pages a day, against a plan of 28." */
function paceLine(ctx: RevoContext): Line | null {
  const { pagesPerDay30, plannedPerDay, memorizedPages } = ctx.totals;
  if (memorizedPages <= 0) return null;
  const perDay = pagesPerDay30 > 0 && pagesPerDay30 < 1 ? 'less than a page a day' : `${plural(Math.round(pagesPerDay30), 'page')} a day`;
  const plan = plannedPerDay > 0 ? `, against a plan of ${plannedPerDay}` : '';
  return { text: `Over the last 30${NBSP}days you’ve revised ${perDay}${plan}.`, chip: 'How is my pace?' };
}

/** Insights: what stands out first, then (opened again) coverage, then pace: the line itself takes turns. */
function insightLines(f: Extract<PlaceFacts, { kind: 'insights' }>, ctx: RevoContext): { lines: Line[]; chips: (string | null)[] }[] {
  const out: { lines: Line[]; chips: (string | null)[] }[] = [];
  if (f.weak) {
    const name = passageLong(f.weak.pages);
    const only = ctx.weakPages.length <= f.weak.pages.length;
    const when = f.weak.daysAgo == null ? 'hasn’t been revised yet' : `was last revised ${lastWhen(f.weak.daysAgo, todayOf(ctx))}`;
    out.push({
      lines: [{ text: `${name} is rated weak and ${when}${only ? '' : ', the longest of your weak parts'}.` }, { text: 'Want a short plan for it?' }],
      chips: [`Plan ${passageShort(f.weak.pages)}`, 'Which parts are weakest?', 'How is my pace?'],
    });
  } else if (f.stalest) {
    const { juz, daysAgo, juzCount } = f.stalest;
    if (daysAgo != null && daysAgo <= 7) {
      out.push({ lines: [{ text: `Every juz you’ve memorized was revised in the last 7${NBSP}days.` }], chips: ['Show my juz by last revised', 'How is my pace?'] });
    } else {
      const text =
        daysAgo == null
          ? `${juzName(juz)} hasn’t been revised yet.`
          : `${juzName(juz)} hasn’t come round in ${plural(daysAgo, 'day')}${juzCount > 1 ? ', the longest of your juz' : ''}.`;
      out.push({ lines: [{ text }], chips: [`When does ${juzName(juz)} come round next?`, 'Show my juz by last revised', 'How is my pace?'] });
    }
  }
  const coverage = coverageLine(ctx);
  if (coverage) out.push({ lines: [coverage], chips: [coverage.chip ?? null, 'How is my pace?', 'Which days do I miss?'] });
  const pace = paceLine(ctx);
  if (pace) out.push({ lines: [pace], chips: ['How is my pace?', 'Which days do I miss?', 'How was my week?'] });
  return out;
}

const todayOf = (ctx: RevoContext) => ctx.week[ctx.week.length - 1]?.day ?? '';

function weakLine(f: Extract<PlaceFacts, { kind: 'weak' }>): Built {
  if (f.count === 0) return { lead: 'None of your pages are rated weak right now.', second: null, turns: [], chips: ['Which parts are weakest?', 'How is my pace?'] };
  const where = f.mostIn ? (f.count === 1 ? `, in ${f.mostIn}` : `, most in ${f.mostIn}`) : '';
  if (f.from === 'weakSpots') {
    return {
      lead: `You have ${plural(f.count, 'weak page')}${where}.`,
      second: { text: f.count === 1 ? 'Ask about it, or I can plan it.' : 'Ask about them, or I can plan them.' },
      turns: [],
      chips: ['Plan my weak spots', 'Why do they slip?'],
    };
  }
  const longest = f.longest.length > 0 ? passageLong(f.longest) : null;
  return {
    lead: `${plural(f.count, 'page')} ${f.count === 1 ? 'is' : 'are'} rated weak${where}.`,
    second: longest && f.count > 1 ? { text: `The one left longest is ${longest}.` } : null,
    turns: [],
    chips: [longest ? `Plan ${passageShort(f.longest)}` : 'Plan my weak spots', 'Why do they slip?'],
  };
}

function juzLine(f: Extract<PlaceFacts, { kind: 'juz' }>, strength: boolean): Built {
  const { juz, facts } = f;
  const name = juzName(juz);
  if (facts.memorized === 0) {
    return { lead: `You haven’t memorized any of ${name} yet.`, second: null, turns: [], chips: [`What’s in ${name}?`, 'How is my pace?'] };
  }
  const all = facts.memorized >= facts.pages;
  const subject = all ? `${name} is all memorized` : `You’ve memorized ${facts.memorized} of ${name}’s ${plural(facts.pages, 'page')}`;
  const days = facts.revised.last30.days;
  const ago = facts.lastRevisedDaysAgo;
  let lead: string;
  if (ago == null) lead = `${subject}, and ${all ? 'it hasn’t' : 'they haven’t'} been revised yet.`;
  else if (days > 0) lead = `${subject}, revised ${timesWord(days)} in the last 30${NBSP}days, last ${lastWhenFromFacts(ago)}.`;
  else lead = `${subject}, not revised in the last 30${NBSP}days, last ${ago}${NBSP}days ago.`;
  const weak = strength ? facts.strength.weak : 0;
  const second: Line | null = weak > 0 ? { text: `${weak === 1 ? '1 of its pages is' : `${weak} of its pages are`} rated weak.` } : null;
  const next = facts.next;
  const turns: Line[] = next
    ? [{ text: `It comes round next ${next.inDays === 1 ? 'tomorrow' : `in ${plural(next.inDays, 'day')}`}, ${plural(next.pages, 'page')}.` }]
    : [];
  return {
    lead,
    second,
    turns,
    chips: [`How is ${name} doing?`, `When does ${name} come round next?`, weak > 0 ? `Plan ${name}’s weak pages` : null],
  };
}

/** "today", "yesterday", "4 days ago" (a juz's facts have no date to name a weekday from). */
const lastWhenFromFacts = (daysAgo: number) => (daysAgo <= 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}${NBSP}days ago`);

export interface Opener {
  text: string;
  chips: string[];
}

const hello = (name: string | null) => (name ? `Salaam ${name}.` : 'Salaam.');
const uniq = (list: (string | null | undefined)[]) => [...new Set(list.filter((c): c is string => !!c))].slice(0, 3);

/**
 * Revo's first line and suggestions for where it was opened. `open` counts this place's opens
 * before this one, today, in the same state (lib/revo/greeting nextOpens, per place): 0 is the first.
 */
export function revoOpener(
  name: string | null,
  ctx: RevoContext,
  facts: PlaceFacts | null,
  open = 0,
  extras: GreetingExtras = {},
): Opener {
  if (facts == null) return { text: revoGreeting(name, ctx, open, extras), chips: revoChips(ctx, open, extras) };
  const strength = extras.strength !== false;
  if (facts.kind === 'insights') {
    const lines = insightLines(facts, ctx);
    if (lines.length === 0) return { text: revoGreeting(name, ctx, open, extras), chips: revoChips(ctx, open, extras) };
    const pick = lines[open % lines.length];
    return { text: [hello(name), ...pick.lines.map((l) => l.text)].join(' '), chips: uniq(pick.chips) };
  }
  const built =
    facts.kind === 'day'
      ? dayLine(facts, ctx)
      : facts.kind === 'overview'
        ? overviewLine(facts, ctx)
        : facts.kind === 'weak'
          ? weakLine(facts)
          : juzLine(facts, strength);
  const turns = [...built.turns, ...placeTurns(ctx, extras)];
  // Opened again with nothing changed: the second sentence takes its turn, so two opens in a row differ.
  const second = open > 0 && turns.length > 0 ? turns[(open - 1) % turns.length] : built.second;
  return { text: [hello(name), built.lead, second?.text].filter(Boolean).join(' '), chips: uniq(built.chips) };
}
