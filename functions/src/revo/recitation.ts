/**
 * Revo and the user's recitation (Revisely Dev): Recite with Mark mistakes marks words as they recite, and the takes are
 * kept on the account. The app sends what its Insights shows of them (`context.recitation`) and, when the user attaches
 * one, a take's marks; this writes both out in sentences for the model.
 *
 * The rules for talking about it travel as a second system block, only in requests that carry a recitation, so store
 * users' requests (and their prompt cache, and the recorded replies the tests use) are exactly as before.
 *
 * Majd's rules (Nov 14–16 2026): only marks that exist; "Not clear" is never "wrong"; words and similar ayat before
 * harakat; going back to restart is never a mistake; surahs and ayat first, never pages.
 */
import type { RevoRecitation, RevoTakeFacts, RevoTakeMark } from './types';

export const RECITATION_SYSTEM = [
  'Their recitation (Revisely Dev only):',
  'Recite is the microphone on the reader’s bar in Revisely Dev, the test app. With “Mark mistakes” on, a checker on the server marks words as they recite: red for a wrong, skipped or extra word; amber for a haraka or letter slip, and for “Not clear”; violet for a tajweed note (Strict only). Where everything is (a take’s summary, the takes kept, past mistakes on the page, Activity and Insights) is in the Dev guide.',
  '',
  'How to talk about it:',
  '- You only know what the context’s recitation part and an attached take say. Never invent a mistake, a word, an ayah, a take or a score. If they ask about a take or a passage you weren’t given, say you can’t see it from here, and suggest attaching the take (hold it in Activity, then “Ask Revo about this take”) or opening it in Activity.',
  '- You never hear their recitation; you only know what the checker marked.',
  '- “Not clear” means the checker couldn’t hear a haraka or letter clearly enough to judge. It is never a mistake and never counts in the score: say it wasn’t clear enough to check, never that it was wrong.',
  '- What matters most for keeping the Qur’an comes first: wrong, skipped and extra words, and going on with a similar ayah. Harakat and letter slips come after, briefly. Tajweed notes come only from Strict takes; mention them when asked, or when there is nothing else.',
  '- Going back a few words to restart an ayah is proper recitation, never a mistake. The checker doesn’t mark it, and you never call it one.',
  '- For a slip into a similar ayah, name both places, surah first (“from Al-Baqarah 48 into Al-Baqarah 123”), and suggest reciting the two one after the other to tell them apart. Don’t explain the ayat beyond the words you were given: no tafsir.',
  '- Name passages by surah and ayahs (“Al-Kahf, ayahs 22–23”), never by page.',
  '- The checker can be wrong. If they say a mark is wrong, tell them to tap it and choose “Not a mistake”.',
  '- Steps that fit: reciting the passage again today and once more on another day (that clears its marks), “Recite the mistakes again” after a take, "Recite your mistakes here" from the held mic on a page with words still marked (Premium), opening the reader at the surah (openScreen with screen "reader" and the surah), where the marks show, or reciting a similar pair one after the other.',
  '- With Smart Tracking off they don’t rate pages: talk about the mistakes heard and when they last recited, never ratings or strength. With it on, you may say a passage rated strong still slips when recited, but never guess or change a rating.',
  '- Never give a tajweed or fiqh ruling beyond what a mark says.',
].join('\n');

const count = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const timesWord = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${n} times`);
const ago = (days: number) => (days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);

/** A score as the app shows it: "100%", "98.6%" (tenths, rounded down, so a take with a mistake never reads 100%). */
export function percent(a: number): string {
  const x = Math.min(1, Math.max(0, a));
  if (x >= 1) return '100%';
  const tenths = Math.min(999, Math.floor(x * 1000 + 1e-6));
  return `${(tenths / 10).toFixed(1)}%`;
}

function kindsText(r: Pick<RevoRecitation, 'kinds'>): string {
  const k = r.kinds;
  const parts = [
    k.wrong ? count(k.wrong, 'wrong word') : '',
    k.skipped ? `${k.skipped} skipped` : '',
    k.added ? count(k.added, 'extra word') : '',
    k.harakat ? count(k.harakat, 'haraka slip') : '',
    k.letter ? count(k.letter, 'letter slip') : '',
  ].filter(Boolean);
  return parts.join(', ');
}

/** The context's recitation part, as the model reads it. */
export function recitationText(r: RevoRecitation): string {
  const lines = [`Their recitation, the last ${r.days} days (Recite with Mark mistakes; follow the rules on recitation):`];
  if (r.takes === 0) lines.push(`- No takes in the last ${r.days} days.`);
  else {
    const before = r.earlierScore === null ? '' : ` (the ${r.days} days before: ${percent(r.earlierScore)})`;
    // Takes kept without the checker's final answer never count in a score (RECITE-11): with only those, there is none.
    const score =
      r.score === null
        ? 'No score: none of these takes got the checker’s final answer (the connection ended first), so none was scored'
        : `Score by the page: ${percent(r.score)}${before}`;
    lines.push(`- ${count(r.takes, 'take')} on ${count(r.daysRecited, 'day')}, ${r.minutes} min, ${count(r.words, 'word')} recited. ${score}.`);
    const mistakes = r.mistakes === 0 ? 'none' : `${r.mistakes}: ${kindsText(r)}`;
    const tajweed = r.tajweed === null ? '' : ` Tajweed notes (Strict takes): ${r.tajweed}.`;
    lines.push(`- Mistakes: ${mistakes}. Not clear (never counted): ${r.unclear}.${tajweed}`);
    if (r.weeks.length > 1) lines.push(`- Score week by week, oldest first, this week last: ${r.weeks.map((w) => (w === null ? 'no takes' : percent(w))).join(', ')}.`);
  }
  lines.push(`- Words still marked on the page: ${r.stillMarked}. Cleared in these ${r.days} days: ${r.cleared}.`);
  if (r.slipping.length > 0) {
    lines.push('- Keeps slipping (words still marked, the most slipped first):');
    for (const s of r.slipping) {
      const slips = s.words - s.wordMistakes;
      const what = [s.wordMistakes ? count(s.wordMistakes, 'wrong, skipped or extra word') : '', slips ? count(slips, 'haraka or letter slip') : '']
        .filter(Boolean)
        .join(', ');
      lines.push(`  - ${s.passage.name}: ${count(s.words, 'word')} still marked (${what}); wrong in ${s.wrong} of ${count(s.tries, 'take')}; last recited ${ago(s.daysAgo)}.`);
    }
  }
  if (r.similar.length > 0) {
    lines.push(`- Similar ayahs they went on with, these ${r.days} days:`);
    for (const s of r.similar) {
      const also = s.also > 0 ? `; the same words are also in ${count(s.also, 'other ayah', 'other ayat')}` : '';
      const what = s.ending ? `${s.from.name} ended as ${s.into.name} ends` : `From ${s.from.name} into ${s.into.name}`;
      lines.push(`  - ${what}, ${timesWord(s.times)}, last ${ago(s.daysAgo)}${also}.`);
    }
  }
  if (r.last) {
    const l = r.last;
    const extra = [l.unclear ? `${l.unclear} not clear` : '', l.hidden ? 'page hidden' : '', l.strict ? 'Strict' : 'Words & harakat'].filter(Boolean).join(', ');
    lines.push(`- Their latest take: ${ago(l.daysAgo)}, ${l.passage.name}, ${percent(l.score)}, ${l.mistakes === 0 ? 'no mistakes' : count(l.mistakes, 'mistake')}, ${extra}.`);
  }
  return lines.join('\n');
}

const KIND_WORDS: Record<RevoTakeMark['kind'], string> = {
  word: 'wrong word',
  skipped: 'skipped word',
  added: 'extra word',
  harakat: 'haraka slip',
  letter: 'letter slip',
  tajweed: 'tajweed note',
};

const RULE_WORDS: Record<NonNullable<RevoTakeMark['rule']>, string> = {
  madd_munfasil: 'madd munfasil length',
  madd_muttasil: 'madd muttasil length',
  madd_aared: 'madd ‘arid length',
  madd_lazim: 'madd lazim held short',
  madd_dropped: 'madd not heard',
  qalqalah: 'qalqalah not heard',
  ghunnah: 'ghunnah not held',
  ikhfa: 'ikhfa',
  idgham: 'idgham',
  idgham_no_ghunnah: 'idgham without ghunnah',
  iqlab: 'iqlab',
};

function markText(m: RevoTakeMark): string {
  const where = m.name;
  if (m.unclear) return `${where}: not clear (a ${m.kind === 'letter' ? 'letter' : 'haraka'} the checker couldn’t hear clearly; never counted)${m.expected ? `, in «${m.expected}»` : ''}`;
  if (m.kind === 'tajweed') {
    const rule = m.rule ? RULE_WORDS[m.rule] : 'tajweed';
    const counts = m.got != null && m.set != null ? ` (held about ${Math.round(m.got)} counts, their setting ${m.set})` : '';
    return `${where}: tajweed note, ${rule}${counts}${m.expected ? `, in «${m.expected}»` : ''}`;
  }
  const parts = [`${where}: ${KIND_WORDS[m.kind]}`];
  if (m.expected) parts.push(`expected «${m.expected}»`);
  if (m.heard) parts.push(m.kind === 'added' ? `said «${m.heard}»` : `heard «${m.heard}»`);
  if (m.detail === 'sound') parts.push('said as a sound that isn’t a word');
  if (m.detail === 'order') parts.push('words out of order');
  if (m.detail === 'trail') parts.push('after the passage’s end');
  if (m.into) {
    const also = m.into.also > 0 ? ` (its words are also in ${count(m.into.also, 'other ayah', 'other ayat')})` : '';
    parts.push(m.into.ending ? `ended as ${m.into.name} ends` : `went on with ${m.into.name}, a similar ayah${also}`);
  }
  return parts.join(', ');
}

/** An attached take, as the model reads it. */
export function takeText(label: string, f: RevoTakeFacts): string {
  const lines = [`Attached: a take (${label}), ${ago(f.daysAgo)}. What the app shows for it:`];
  const level = f.level === 'strict' ? 'Strict (tajweed checked too)' : 'Words & harakat';
  lines.push(`- ${f.passage.name}, ${count(f.words, 'word')} in ${Math.max(1, Math.round(f.secs / 60))} min, ${level}${f.hidden ? ', recited with the page hidden' : ''}.`);
  const before = f.before === null ? '' : ` (their take before of this passage: ${percent(f.before)})`;
  lines.push(`- Score by the page: ${percent(f.score)}${before}. Mistakes: ${f.mistakes}. Not clear (never counted): ${f.unclear}.${f.level === 'strict' ? ` Tajweed notes: ${f.tajweed}.` : ''}`);
  if (f.cleared > 0) lines.push(`- It cleared ${count(f.cleared, 'word')} still marked from earlier takes.`);
  if (f.marks.length === 0) lines.push('- No marks.');
  else {
    const cut = f.marks.length < f.mistakes + f.unclear + f.tajweed ? ' (the first of them)' : '';
    lines.push(`- Its marks, in order${cut}:`);
    for (const m of f.marks) lines.push(`  - ${markText(m)}.`);
  }
  return lines.join('\n');
}
