// Revo's first line and suggestion chips, written on the phone from today's data: no call,
// no question counted. A question the user then asks goes to the server. Opened again with
// nothing changed, it says something else (REVO-35): "done" once, then what's ahead, in turn.

import { placeOfPage } from '../passages';
import type { RevoContext } from './types';
import { passageLong, passageShort } from './words';

/** "p. 548", "p. 548–549", "p. 12, 40". */
export function pagesLabel(pages: readonly number[]): string {
  if (pages.length === 0) return '';
  const sorted = [...pages].sort((a, b) => a - b);
  const runs: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const p of sorted.slice(1).concat(Number.NaN)) {
    if (p === prev + 1) {
      prev = p;
      continue;
    }
    runs.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = p;
    prev = p;
  }
  return `p. ${runs.join(', ')}`;
}

/** The same at the start of a sentence: "Page 302", "Pages 548–549". */
export function pagesLabelStart(pages: readonly number[]): string {
  const label = pagesLabel(pages);
  return label.replace(/^p\. /, pages.length > 1 ? 'Pages ' : 'Page ');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The two (or one) pages coming up next. */
function upNext(ctx: RevoContext): number[] {
  return ctx.today.nextPages.slice(0, 2);
}

/**
 * What the phone knows beside Revo's context, for the greeting only (never sent): Home's
 * "Done · N" and the next revision day's start (Home's "Tomorrow starts at …").
 */
export interface GreetingExtras {
  /** Pages done for today, as Home's "Done · N" counts them (today's plan's own count until known). */
  doneCount?: number;
  /** Once today is done, the next revision day with pages: "Tomorrow" or its weekday, its first page and size. */
  next?: { lead: string; first: number; pages: number } | null;
}

/** Where today stands, so a sheet opened again with nothing changed can say something else (REVO-35). */
export function greetingState(ctx: RevoContext): string {
  if (ctx.today.plannedPages === 0) return 'none';
  if (ctx.today.done) return 'done';
  return `todo:${ctx.today.revisedPages}`;
}

/** How many times today's greeting has opened in that state before: kept per account on the phone. */
export interface GreetingOpens {
  day: string;
  state: string;
  n: number;
}

/** The record after one more open: the same day and state count on, anything else starts again. */
export function nextOpens(prev: GreetingOpens | null, day: string, state: string): GreetingOpens {
  return prev != null && prev.day === day && prev.state === state ? { day, state, n: prev.n + 1 } : { day, state, n: 0 };
}

/** One thing from the account's own data a greeting can lead with, and the suggestion that goes with it. */
interface Aside {
  kind: 'next' | 'weak' | 'week' | 'memorized' | 'streak';
  text: string;
  chip: string;
}

/** "17.9%": of the 604 pages, to one decimal, as Home says it. */
function percentOfQuran(pages: number): string {
  const percent = Math.round((pages / 604) * 1000) / 10;
  if (percent <= 0) return '0%';
  if (percent >= 100) return '100%';
  return `${percent.toFixed(1)}%`;
}

/** The weak part left longest (the context lists weak pages oldest revised first), with the page after it if weak too. */
function weakToLookAt(ctx: RevoContext): number[] {
  const first = ctx.weakPages[0];
  if (first == null) return [];
  return ctx.weakPages.includes(first + 1) ? [first, first + 1] : [first];
}

/** What a greeting can lead with besides today, in the order they take turns. */
function asides(ctx: RevoContext, extras: GreetingExtras): Aside[] {
  const out: Aside[] = [];
  const next = extras.next;
  if (next) out.push({ kind: 'next', text: `${next.lead} starts at ${placeOfPage(next.first)}, ${plural(next.pages, 'page')}.`, chip: 'How do I revise ahead?' });
  const weak = weakToLookAt(ctx);
  if (weak.length > 0) out.push({ kind: 'weak', text: `${passageLong(weak)} is rated weak. Want a short plan for it?`, chip: `Plan ${passageShort(weak)}` });
  const weekPages = ctx.week.reduce((n, d) => n + d.pages, 0);
  const weekDays = ctx.week.filter((d) => d.pages > 0).length;
  if (weekPages > 0) out.push({ kind: 'week', text: `This week you’ve revised ${plural(weekPages, 'page')} on ${plural(weekDays, 'day')}.`, chip: 'How was my week?' });
  const memorized = ctx.totals.memorizedPages;
  if (memorized > 0) {
    out.push({
      kind: 'memorized',
      text: `You’ve memorized ${percentOfQuran(memorized)} of the Quran.`,
      chip: ctx.weakPages.length > 0 ? 'Which parts are weakest?' : 'How is my pace?',
    });
  }
  if (ctx.totals.streakDays > 1) out.push({ kind: 'streak', text: `You’re on a ${ctx.totals.streakDays}-day streak.`, chip: 'How is my pace?' });
  return out;
}

/** The greeting's parts: what it leads with (or follows today's line with) and the suggestion it puts first. */
interface Opening {
  text: string;
  chip: string | null;
}

/** `open` counts the opens before this one, today, in the same state (0: the first; nextOpens). */
function opening(name: string | null, ctx: RevoContext, open: number, extras: GreetingExtras): Opening {
  const hello = name ? `Salaam ${name}.` : 'Salaam.';
  const { plannedPages, revisedPages, done } = ctx.today;
  const extra = asides(ctx, extras);
  // Nothing new since the last open: lead with something else, in turn, so two opens in a row differ.
  const turn = (list: Aside[]) => (list.length > 0 ? list[(open - 1) % list.length] : null);
  if (plannedPages === 0) {
    const a = open > 0 ? turn(extra.filter((x) => x.kind !== 'streak')) : null;
    if (a) return { text: `${hello} ${a.text}`, chip: a.chip };
    return { text: `${hello} Nothing is planned for today. Ask me about your progress, your weak spots or your plan.`, chip: null };
  }
  if (done) {
    // "Done" once, on the first open after today is done; then what's ahead, in turn.
    if (open > 0) {
      const a = turn(extra.filter((x) => x.kind !== 'streak'));
      return a ? { text: `${hello} ${a.text}`, chip: a.chip } : { text: `${hello} Ask me anything about your revision.`, chip: null };
    }
    const count = extras.doneCount ?? plannedPages;
    const streak = ctx.totals.streakDays > 1 ? ` That’s a ${ctx.totals.streakDays}-day streak.` : '';
    const doneLine = count === plannedPages ? `Today’s ${plural(plannedPages, 'page')} are done.` : `Today is done, with ${plural(count, 'page')} revised.`;
    return { text: `${hello} ${doneLine}${streak} Ask me anything about your revision.`, chip: 'What should I revise next?' };
  }
  const next = upNext(ctx);
  const weakNext = next.filter((p) => ctx.today.weakNext.includes(p));
  const nextLine =
    revisedPages > 0
      ? `You’re ${plural(revisedPages, 'page')} into today, and ${passageLong(next, { sentence: true })} is next.`
      : `Today is ${plural(plannedPages, 'page')}, starting at ${placeOfPage(next[0])}.`;
  // Today's line always: where today stands is the moment. What follows it changes on a second open.
  const weakOffer: Aside | null =
    weakNext.length > 0
      ? {
          kind: 'weak',
          // All of what's next is weak: "It's"; some of it: name that part.
          text: `${revisedPages > 0 && weakNext.length === next.length ? 'It’s' : `${passageLong(weakNext)} is`} rated weak. Want a short plan for it?`,
          chip: `Plan ${passageShort(weakNext)}`,
        }
      : null;
  if (open === 0) {
    if (weakOffer) return { text: `${hello} ${nextLine} ${weakOffer.text}`, chip: weakOffer.chip };
    return { text: `${hello} ${nextLine} Ask me anything about your revision.`, chip: null };
  }
  // While today isn't done, tomorrow and other weak parts would pull away from it: the week, the
  // memorized share and the streak take turns.
  const a = turn(extra.filter((x) => x.kind !== 'weak' && x.kind !== 'next'));
  if (a) return { text: `${hello} ${nextLine} ${a.text}`, chip: a.chip };
  return { text: `${hello} ${nextLine} Ask me anything about your revision.`, chip: weakOffer?.chip ?? null };
}

// Parts of the Qur'an by surah and juz, never page numbers (lib/revo/words over lib/passages).
export function revoGreeting(name: string | null, ctx: RevoContext, open = 0, extras: GreetingExtras = {}): string {
  return opening(name, ctx, open, extras).text;
}

/** Up to three suggestions under the greeting, the first about what it leads with; a tap asks it as written. */
export function revoChips(ctx: RevoContext, open = 0, extras: GreetingExtras = {}): string[] {
  const out: string[] = [];
  const lead = opening(null, ctx, open, extras).chip;
  const weakNext = upNext(ctx).filter((p) => ctx.today.weakNext.includes(p));
  if (lead && lead !== 'What should I revise next?') out.push(lead);
  if (weakNext.length > 0) out.push(`Plan ${passageShort(weakNext)}`);
  else if (ctx.weakPages.length > 0) out.push('Which parts are weakest?');
  out.push('How was my week?');
  out.push(ctx.today.done ? 'What should I revise next?' : 'How is my pace?');
  return [...new Set(out)].slice(0, 3);
}
