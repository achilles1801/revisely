// Opening Revo from anywhere: the button, Settings, or a screen that wants a question asked
// about something it shows (e.g. an Insights section, with that insight attached). RevoHost
// listens; nothing is sent until the user asks.

import type { RevoPlace } from './place';
import { firstAyahOfPage, lastAyahOfPage, type AyahKey } from '../ayahKeys';
import type { QuranScope, RevoAttachment } from './types';

export interface RevoOpenRequest {
  /** Attached to the next question (the user can remove it). */
  attach?: RevoAttachment;
  /** Where it was opened from, for its first line (REVO-38); else the screen in front (lib/revo/place). */
  place?: RevoPlace;
  /** Open this conversation (History, a Day in review). */
  chatId?: string;
  /** Open on Memory, or the opt-in. */
  view?: 'memory' | 'optin';
  /** Opened from the mushaf (REVO-45): a question about this page or ayah, answered from the tafsir (REVO-44). */
  quran?: RevoQuranOpen;
}

/** The page or ayah Revo was opened about from the mushaf, and its chip ("An-Naml, 3rd page", "An-Naml 35"). */
export interface RevoQuranOpen {
  scope: QuranScope;
  label: string;
  kind: 'page' | 'ayah';
}

const pair = (k: AyahKey): [number, number] => [Math.floor(k / 1000), k % 1000];

/** A page of the mushaf as a scope (its first ayah to its last, in the edition shown). */
export function pageScope(page: number): QuranScope {
  return { from: pair(firstAyahOfPage(page)), to: pair(lastAyahOfPage(page)) };
}

/** One ayah as a scope. */
export function ayahScope(key: AyahKey): QuranScope {
  return { from: pair(key), to: pair(key) };
}

const listeners = new Set<(r: RevoOpenRequest) => void>();
let pending: RevoOpenRequest | null = null;

export function openRevo(request: RevoOpenRequest = {}): void {
  if (listeners.size === 0) {
    pending = request;
    return;
  }
  listeners.forEach((l) => l(request));
}

export function onRevoOpen(listener: (r: RevoOpenRequest) => void): () => void {
  listeners.add(listener);
  if (pending) {
    const r = pending;
    pending = null;
    listener(r);
  }
  return () => {
    listeners.delete(listener);
  };
}
