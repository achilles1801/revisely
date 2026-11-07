// Revo's first line and suggestion chips, written on the phone from today's data: no call,
// no question counted. A question the user then asks goes to the server.

import type { RevoContext } from './types';

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

export function revoGreeting(name: string | null, ctx: RevoContext): string {
  const hello = name ? `Salaam ${name}.` : 'Salaam.';
  const { plannedPages, revisedPages, done } = ctx.today;
  if (plannedPages === 0) {
    return `${hello} Nothing is planned for today. Ask me about your progress, your weak spots or your plan.`;
  }
  if (done) {
    const streak = ctx.totals.streakDays > 1 ? ` That’s a ${ctx.totals.streakDays}-day streak.` : '';
    return `${hello} Today’s ${plural(plannedPages, 'page')} are done.${streak} Ask me anything about your revision.`;
  }
  const next = upNext(ctx);
  const weakNext = next.filter((p) => ctx.today.weakNext.includes(p));
  const nextLine =
    revisedPages > 0
      ? `You’re ${plural(revisedPages, 'page')} into today, and ${pagesLabel(next)} ${next.length > 1 ? 'are' : 'is'} coming up next.`
      : `Today is ${plural(plannedPages, 'page')}, starting at ${pagesLabel(next.slice(0, 1))}.`;
  if (weakNext.length > 0) {
    const many = weakNext.length > 1;
    // All of what's next is weak: "They're"; some of it: name the pages.
    const which =
      revisedPages > 0 && weakNext.length === next.length ? (many ? 'They’re' : 'It’s') : `${pagesLabelStart(weakNext)} ${many ? 'are' : 'is'}`;
    return `${hello} ${nextLine} ${which} rated weak. Want a short plan for ${many ? 'them' : 'it'}?`;
  }
  return `${hello} ${nextLine} Ask me anything about your revision.`;
}

/** Up to three suggestions under the greeting; a tap asks it as written. */
export function revoChips(ctx: RevoContext): string[] {
  const out: string[] = [];
  const weakNext = upNext(ctx).filter((p) => ctx.today.weakNext.includes(p));
  if (weakNext.length > 0) out.push(`Plan ${pagesLabel(weakNext)}`);
  else if (ctx.weakPages.length > 0) out.push('Which pages are weakest?');
  out.push('How was my week?');
  out.push(ctx.today.done ? 'What should I revise next?' : 'How is my pace?');
  return out.slice(0, 3);
}
