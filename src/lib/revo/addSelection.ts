// What the Add to chat sheet holds while the user chooses: keys (a surah, a juz, pages, a day), at
// most REVO_MAX_ATTACHMENTS with what was already attached. The attachments are built from the
// keys when Add is tapped, so their figures are the phone's at that moment (lib/revo/facts).

import { shiftDay } from '../journal';
import { dayAttachment, dayLabel, juzAttachment, pagesAttachment, surahAttachment } from './attachments';
import type { DayExtras, Prepared } from './facts';
import { REVO_MAX_ATTACHMENTS, type RevoAttachment } from './types';

export type AddKey =
  | { kind: 'surah'; surah: number; label: string }
  | { kind: 'juz'; juz: number; label: string }
  | { kind: 'pages'; pages: number[]; label: string }
  | { kind: 'day'; day: string };

/** One id per thing: choosing it twice is choosing it once. */
export function keyId(k: AddKey): string {
  switch (k.kind) {
    case 'surah':
      return `surah:${k.surah}`;
    case 'juz':
      return `juz:${k.juz}`;
    case 'pages':
      return `pages:${k.pages.join(',')}`;
    case 'day':
      return `day:${k.day}`;
  }
}

/** The key an attachment came from; null for kinds the sheet doesn't offer (an insight, a recording). */
export function keyOf(a: RevoAttachment): AddKey | null {
  switch (a.kind) {
    case 'surah':
      return { kind: 'surah', surah: a.surah, label: a.label };
    case 'juz':
      return { kind: 'juz', juz: a.juz, label: a.label };
    case 'pages':
      return { kind: 'pages', pages: a.pages, label: a.label };
    case 'revisionDay':
      return { kind: 'day', day: a.day };
    default:
      return null;
  }
}

/** Chosen, or not: adds the key (unless `room` is used up) or takes it away. */
export function toggleKey(keys: readonly AddKey[], key: AddKey, room = REVO_MAX_ATTACHMENTS): AddKey[] {
  const id = keyId(key);
  if (keys.some((k) => keyId(k) === id)) return keys.filter((k) => keyId(k) !== id);
  return keys.length >= room ? [...keys] : [...keys, key];
}

export const isChosen = (keys: readonly AddKey[], key: AddKey) => keys.some((k) => keyId(k) === keyId(key));

/** "Tue 27 Oct", "Today · Sat 7 Nov": a day as the chips and rows say it. */
export function dayName(day: string, today: string): string {
  return dayLabel(day, today, shiftDay(today, -1));
}

/** The attachments for the chosen keys, in the order chosen, with what the phone shows now. */
export function buildAttachments(keys: readonly AddKey[], prepared: Prepared, extras: DayExtras): RevoAttachment[] {
  const today = prepared.src.snapshot.day;
  return keys.map((k) => {
    switch (k.kind) {
      case 'surah':
        return surahAttachment(k.surah, prepared);
      case 'juz':
        return juzAttachment(k.juz, prepared);
      case 'pages':
        return pagesAttachment(k.pages, prepared, k.label);
      case 'day':
        return dayAttachment(k.day, dayName(k.day, today), prepared, extras);
    }
  });
}
