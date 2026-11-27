// What Revo is told of the user's recitation (Revisely Dev, RINS-1): the figures Insights shows of the takes kept on
// the account (lib/reciteInsights), and one take's marks when the user attaches it. Worked out here, on the phone, in
// the server's shape (functions/src/revo/validate.ts checks they add up), with parts of the Qur'an in words, surah and
// ayah first. Text only: never audio, recordings or ids, and a sound that isn't a word is never sent as heard.

import { ayahCount, ayahKey } from '../ayahKeys';
import { shiftDay } from '../journal';
import { describeAyahs, surahName } from '../passages';
import { daysSince } from '../recency';
import type { QuranWords } from '../recite/quranWords';
import { isCorrected, isUnclear, Mark } from '../reciteLive/contract';
import { clearedBy } from '../reciteMemory/memory';
import type { MemoryRecord, TakeRecord } from '../reciteMemory/record';
import { liveTakes, mistakeKindOf, recitationInsights, WINDOW_DAYS, wordsOf } from '../reciteInsights/insights';
import { dayLabel } from './attachments';
import type { RevoAttachment, RevoRecitation, RevoRecitedAyah, RevoRecitedPassage, RevoTakeFacts, RevoTakeMark } from './types';
import { passageWords, shortWords } from './words';
import { t } from '../../i18n';

/** Lists the server takes at most (functions/src/revo/types.ts). */
const LIST = 5;
const TAKE_MARKS = 60;
/** What the server takes as an Arabic word: Arabic letters and marks and spaces, at most 60. */
const ARABIC_RE = /^[\p{Script=Arabic}\p{M}\u0640\u00A0 ]+$/u;
const arabic = (text: string | undefined): string | undefined => {
  const t = text?.trim();
  return t && t.length <= 60 && ARABIC_RE.test(t) ? t : undefined;
};

const ago = (day: string, today: string) => Math.max(0, daysSince(day, today));

/** Ayahs `from`..`to` of a surah in words ("Al-Kahf, ayahs 22–23"), or null when they can't be worded. */
export function ayahsPassage(sura: number, from: number, to: number): RevoRecitedPassage | null {
  const keys: number[] = [];
  for (let a = from; a <= to; a++) keys.push(ayahKey(sura, a));
  const name = passageWords(describeAyahs(keys, { juz: false }));
  return name ? { sura, from, to, name } : null;
}

/** One ayah in short words ("Al-Baqarah 48"). */
export function ayahWords(sura: number, ayah: number): RevoRecitedAyah | null {
  const name = shortWords(`${surahName(sura)} ${ayah}`);
  return name ? { sura, ayah, name } : null;
}

/** The ayahs a take recited, from its first word to the furthest it reached (sura × 1000 + ayah). */
function takeKeys(words: QuranWords, take: Pick<TakeRecord, 'from' | 'to'>): number[] {
  const a = words.ref(take.from);
  const b = words.ref(take.to);
  const keys: number[] = [];
  for (let s = a.sura; s <= b.sura; s++) {
    const first = s === a.sura ? a.ayah : 1;
    const last = s === b.sura ? b.ayah : ayahCount(s);
    for (let x = first; x <= last; x++) keys.push(ayahKey(s, x));
  }
  return keys;
}

/**
 * A take's passage. A take running into the next surah is named whole ("Al-Mulk 27 to Al-Qalam 15"); its numbers
 * (which only the server's checks read) are its part of the first surah.
 */
export function takePassage(words: QuranWords, take: Pick<TakeRecord, 'from' | 'to'>): RevoRecitedPassage | null {
  const keys = takeKeys(words, take);
  const name = passageWords(describeAyahs(keys, { juz: false }));
  if (!name || keys.length === 0) return null;
  const first = keys[0];
  const sura = Math.floor(first / 1000);
  const inFirst = keys.filter((k) => Math.floor(k / 1000) === sura);
  return { sura, from: first % 1000, to: inFirst[inFirst.length - 1] % 1000, name };
}

/**
 * The recitation part of Revo's context: the last 4 weeks of takes as Insights shows them, the passages that keep
 * slipping, the similar ayahs gone on with, and the latest take. Null when the account has no takes, or the word data
 * (for the latest take's passage) isn't loaded: Revo is then told nothing of recitation, rather than half of it.
 */
export function recitationForRevo(records: readonly MemoryRecord[], today: string, words: QuranWords | null): RevoRecitation | null {
  const takes = liveTakes(records);
  if (takes.length === 0 || !words) return null;
  const ins = recitationInsights(records, today, WINDOW_DAYS, words);
  const latest = ins.last as TakeRecord;
  const lastPassage = takePassage(words, latest);
  if (!lastPassage) return null;
  const slipping: RevoRecitation['slipping'] = [];
  for (const p of ins.slipping) {
    if (slipping.length >= LIST) break;
    const passage = ayahsPassage(p.sura, p.from, p.to);
    if (passage) slipping.push({ passage, words: p.words.length, wordMistakes: p.wordMistakes, wrong: p.wrong, tries: p.tries, daysAgo: ago(p.lastDay, today) });
  }
  const similar: RevoRecitation['similar'] = [];
  for (const s of ins.similar) {
    if (similar.length >= LIST) break;
    const from = ayahWords(s.from[0], s.from[1]);
    const into = ayahWords(s.into[0], s.into[1]);
    if (from && into) similar.push({ from, into, ending: s.ending, times: s.times, also: Math.min(100, s.also), daysAgo: ago(s.lastDay, today) });
  }
  return {
    days: WINDOW_DAYS,
    takes: ins.takes,
    daysRecited: ins.days,
    minutes: Math.round(ins.secs / 60),
    words: ins.words,
    mistakes: ins.mistakes,
    kinds: ins.kinds,
    unclear: ins.unclear,
    tajweed: ins.strictTakes > 0 ? ins.tajweed : null,
    score: ins.score,
    earlierScore: ins.earlierScore,
    weeks: ins.weeks.map((w) => w.score),
    stillMarked: ins.stillMarked,
    cleared: ins.cleared.length,
    slipping,
    similar,
    last: {
      daysAgo: ago(latest.day, today),
      passage: lastPassage,
      score: latest.accuracy,
      mistakes: latest.marks.filter((m) => mistakeKindOf(m) !== null).length,
      unclear: latest.marks.filter(isUnclear).length,
      hidden: latest.hidden,
      strict: latest.level === 'strict',
    },
    // The mistakes a page Insights shows for long takes (RECITE-24), only when there are some: without, as before.
    ...(ins.perPage ? { perPage: ins.perPage } : {}),
  };
}

/** One mark of a take, as the server takes it (null when its ayah can't be worded). */
function takeMark(m: Mark, words: QuranWords): RevoTakeMark | null {
  const where = ayahWords(m.ayah[0], m.ayah[1]);
  if (!where) return null;
  const out: RevoTakeMark = { sura: where.sura, ayah: where.ayah, name: where.name, kind: m.kind, unclear: isUnclear(m) };
  if (m.detail) out.detail = m.detail;
  // An extra word's `w` is the word before it: nothing was expected there.
  if (m.kind !== 'added') {
    const expected = arabic(words.uthmani(m.w));
    if (expected) out.expected = expected;
  }
  // The word heard instead: a real word, or the expected word with the heard haraka or letter. Never a sound spelt out.
  if (m.kind !== 'skipped' && m.kind !== 'tajweed' && m.detail !== 'sound' && m.heardExact !== false) {
    const heard = arabic(m.heard);
    if (heard) out.heard = heard;
  }
  if (m.kind === 'tajweed') {
    if (m.rule) out.rule = m.rule;
    if (m.got != null) out.got = Math.min(20, Math.max(0, m.got));
    if (m.expected != null) out.set = Math.min(20, Math.max(0, Math.round(m.expected)));
  }
  if (m.into && (m.kind === 'word' || m.kind === 'skipped')) {
    const into = ayahWords(m.into.ayah[0], m.into.ayah[1]);
    if (into) out.into = { ...into, ending: m.into.ending === true, also: Math.min(100, m.into.also?.length ?? 0) };
  }
  return out;
}

/** The take before this one of (at least half of) the same words, if any. */
function takeBefore(records: readonly MemoryRecord[], take: TakeRecord): TakeRecord | null {
  const length = wordsOf(take);
  const before = liveTakes(records).filter(
    (t) => t.id !== take.id && t.createdAt < take.createdAt && Math.min(take.to, t.to) - Math.max(take.from, t.from) + 1 >= length / 2,
  );
  return before[before.length - 1] ?? null;
}

/** A take as an attachment (Activity's "Ask Revo about this take", or +): its passage, score and marks. */
export function takeAttachment(records: readonly MemoryRecord[], take: TakeRecord, words: QuranWords, today: string): RevoAttachment | null {
  const passage = takePassage(words, take);
  if (!passage) return null;
  const strict = take.level === 'strict';
  // Words & harakat checks no tajweed: a stray note from it isn't sent. Nor is a word corrected straight away: it's no
  // mistake (RECITE-33), and the server's check counts every word mark it's sent as one.
  const marks = [...take.marks].filter((m) => (strict || m.kind !== 'tajweed') && !isCorrected(m)).sort((a, b) => a.w - b.w);
  const counted = {
    mistakes: marks.filter((m) => mistakeKindOf(m) !== null).length,
    unclear: marks.filter(isUnclear).length,
    tajweed: marks.filter((m) => m.kind === 'tajweed').length,
  };
  // At most 60 marks: the mistakes first, then Not clear and tajweed, back in mushaf order.
  const kept = marks.length <= TAKE_MARKS ? marks : [...marks.filter((m) => mistakeKindOf(m) !== null), ...marks.filter((m) => mistakeKindOf(m) === null)].slice(0, TAKE_MARKS).sort((a, b) => a.w - b.w);
  const sent = kept.map((m) => takeMark(m, words)).filter((m): m is RevoTakeMark => m != null);
  // As the server counts: all of them when the list is whole, and what was left out too when it was cut at 60.
  const whole = sent.length < TAKE_MARKS;
  const facts: RevoTakeFacts = {
    daysAgo: ago(take.day, today),
    passage,
    level: take.level,
    hidden: take.hidden,
    secs: Math.min(86_400, take.secs),
    words: wordsOf(take),
    score: take.accuracy,
    mistakes: whole ? sent.filter((m) => m.kind !== 'tajweed' && !m.unclear).length : counted.mistakes,
    unclear: whole ? sent.filter((m) => m.unclear).length : counted.unclear,
    tajweed: whole ? sent.filter((m) => m.kind === 'tajweed').length : counted.tajweed,
    marks: sent,
    cleared: clearedBy(records, take).length,
    before: takeBefore(records, take)?.accuracy ?? null,
  };
  const short = shortWords(describeAyahs(takeKeys(words, take), { form: 'short', juz: false })) ?? t('revo.attach.take');
  return { kind: 'reciteTake', label: `${short} · ${dayLabel(take.day, today, shiftDay(today, -1))}`.slice(0, 60), day: take.day, facts };
}
