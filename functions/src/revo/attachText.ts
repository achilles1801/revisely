/**
 * What the user attached, as the model reads it: plain sentences, the facts the app showed for it
 * and nothing else, with days as people say them ("3 days ago") and parts of the Qur'an in the
 * app's words (surah and juz first). No JSON and no field names: the model repeats what it reads
 * (Nov 7 2026). A fact that is missing is said to be missing, so Revo can say it can't see it.
 */
import type { RevoAttachment, RevoDayFacts, RevoPassageFacts, RevoPlanTally, RevoTimes } from './types';

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const timesWord = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const ago = (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
const pagesNote = (pages: readonly number[]) =>
  pages.length === 1 ? `page ${pages[0]}` : `pages ${pages[0]}–${pages[pages.length - 1]}`;

function timesText(window: string, t: RevoTimes, memorized: number): string {
  if (t.days === 0) return `${window}: not revised`;
  if (memorized <= 1) return t.maxEach ? `${window}: revised ${timesWord(t.maxEach)}` : `${window}: not revised`;
  if (t.minEach === 0) {
    return `${window}: revised in part, on ${count(t.days, 'day')} (some of its memorized pages not at all, the most revised ${timesWord(t.maxEach)})`;
  }
  const each = t.minEach === t.maxEach ? timesWord(t.minEach) : `${t.minEach} to ${t.maxEach} times`;
  return `${window}: revised in full ${timesWord(t.minEach)} (each memorized page ${each}), on ${count(t.days, 'day')}`;
}

function planText(window: string, t: RevoPlanTally): string {
  if (t.days === 0) return `${window}: none of it was on the plan`;
  const parts = [`${t.onDay} revised on their day`];
  if (t.late) parts.push(`${t.late} carried over and revised later`);
  if (t.ahead) parts.push(`${t.ahead} revised ahead, on an earlier day`);
  if (t.skipped) parts.push(`${t.skipped} never revised (missed on ${count(t.skippedDays, 'day')})`);
  return `${window}: on the plan on ${count(t.days, 'day')}, ${count(t.pages, 'page')} in all: ${parts.join(', ')}`;
}

function passageText(label: string, f: RevoPassageFacts): string {
  const lines = [`Attached: ${label} (${f.name}). What the app shows for it:`];
  if (f.memorized === 0) {
    lines.push(`- None of its ${count(f.pages, 'page')} is marked memorized, so it isn’t revised or on the plan.`);
    return lines.join('\n');
  }
  lines.push(`- Memorized: ${f.memorized} of its ${count(f.pages, 'page')}.`);

  const s = f.strength;
  const rated = s.weak + s.moderate + s.strong;
  const unrated = s.unrated ? `; ${count(s.unrated, 'memorized page')} never revised, so not rated yet` : '';
  lines.push(
    rated > 0
      ? `- Ratings (of 5): ${s.weak} weak, ${s.moderate} moderate, ${s.strong} strong, ${s.average} on average${unrated}.`
      : `- Ratings: none yet${unrated}.`,
  );
  lines.push(
    f.weakSpots.length > 0
      ? `- Weak spots, weakest first: ${f.weakSpots.map((w) => `${w.name} (${pagesNote(w.pages)}, rated ${w.rating})`).join('; ')}.`
      : '- Weak spots: none.',
  );

  lines.push(f.lastRevisedDaysAgo === null ? '- Never revised on record.' : `- Last revised ${ago(f.lastRevisedDaysAgo)}.`);
  if (f.oldest) {
    const when = f.oldest.daysAgo === null ? 'never revised on record' : `last revised ${ago(f.oldest.daysAgo)}`;
    lines.push(`- Its page left longest: ${f.oldest.name} (page ${f.oldest.page}), ${when}.`);
  }
  if (f.neverRevised > 0) lines.push(`- ${count(f.neverRevised, 'memorized page')} never revised on record.`);

  const r = f.revised;
  lines.push(
    `- Times revised (a page counts once a day): ${[
      timesText('the last 7 days, today included', r.last7, f.memorized),
      timesText('the last 30 days', r.last30, f.memorized),
      timesText('everything on record', r.all, f.memorized),
    ].join('; ')}.`,
  );
  lines.push(
    `- On the plan, today not counted: ${planText('the 7 days before today', f.plan.last7)}; ${planText('the 30 days before today', f.plan.last30)}.`,
  );
  lines.push(f.today ? `- Today: ${count(f.today.pages, 'page')} of it in today’s revision, ${f.today.done} done.` : '- Not in today’s revision.');
  lines.push(
    f.next
      ? `- Next on the plan: ${f.next.inDays === 1 ? 'tomorrow' : `in ${f.next.inDays} days`}, ${count(f.next.pages, 'page')}.`
      : '- Not on the plan in the coming year.',
  );
  return lines.join('\n');
}

function dayText(label: string, f: RevoDayFacts): string {
  const today = f.daysAgo === 0;
  const lines = [`Attached: ${label}, ${ago(f.daysAgo)}. What the app shows for that day:`];
  const p = f.plan;
  if (!p) lines.push('- Plan: nothing was planned.');
  else {
    const parts = [`${p.onDay} revised on the day`];
    if (p.ahead) parts.push(`${p.ahead} revised ahead, on an earlier day`);
    if (p.late) parts.push(`${p.late} caught up on a later day`);
    if (p.notDone) parts.push(today ? `${p.notDone} still to revise` : `${p.notDone} never revised`);
    const what = p.name ? ` (${p.name})` : '';
    const carried = p.carried ? `, ${p.carried} of them carried over from earlier days` : '';
    const done = today ? (p.done ? 'Today is done.' : 'Today isn’t done yet.') : p.done ? 'The day counts as done for the streak.' : 'The day doesn’t count as done for the streak.';
    lines.push(`- Plan: ${count(p.pages, 'page')}${what}${carried}: ${parts.join(', ')}. ${done}`);
  }
  const rv = f.revised;
  if (rv.pages === 0) lines.push('- Revised in its sessions: nothing.');
  else {
    const other = [rv.forLater ? `${rv.forLater} of them ahead for later days` : '', rv.forEarlier ? `${rv.forEarlier} catching up earlier days` : '']
      .filter(Boolean)
      .join(', ');
    lines.push(`- Revised in its sessions: ${count(rv.pages, 'page')}${rv.name ? ` (${rv.name})` : ''}${other ? `, ${other}` : ''}.`);
  }
  lines.push(f.minutes === null ? '- Revision time: not recorded.' : `- Revision time: ${f.minutes} min.`);
  lines.push(f.readMinutes === null ? '- Reading with the timer: not known.' : `- Reading with the timer: ${f.readMinutes ? `${f.readMinutes} min` : 'none'}.`);
  lines.push(f.memorized.pages > 0 ? `- Marked memorized that day: ${count(f.memorized.pages, 'page')}${f.memorized.name ? ` (${f.memorized.name})` : ''}.` : '- Marked memorized that day: none.');
  const ra = f.ratings;
  if (ra.weak + ra.moderate + ra.strong === 0) lines.push('- Ratings given: none.');
  else {
    const weak = ra.weak ? `${ra.weak} weak${ra.weakName ? ` (${ra.weakName}, ${ra.weakPages.length === 1 ? 'page' : 'pages'} ${ra.weakPages.join(', ')})` : ''}` : '0 weak';
    lines.push(`- Ratings given: ${weak}, ${ra.moderate} moderate, ${ra.strong} strong.`);
  }
  lines.push(
    f.recordings === null
      ? '- Recordings: not known.'
      : `- Recordings on this phone: ${f.recordings.count ? `${f.recordings.count} (${f.recordings.minutes} min)` : 'none'}.`,
  );
  if (f.notes === null) lines.push('- Daily log: couldn’t be read.');
  else if (f.notes.length === 0) lines.push('- Daily log: no notes.');
  else lines.push(`- Daily log, ${count(f.notes.length, 'note')} as written:\n${f.notes.map((n) => `  - “${n.replace(/\s*\n\s*/g, ' / ')}”`).join('\n')}`);
  return lines.join('\n');
}

/** An attachment of the kinds apps send from Nov 7 2026 in sentences; null for the older kinds. */
export function attachedText(a: RevoAttachment): string | null {
  switch (a.kind) {
    case 'surah':
    case 'juz':
    case 'pages':
      return passageText(a.label, a.facts);
    case 'revisionDay':
      return dayText(a.label, a.facts);
    default:
      return null;
  }
}
