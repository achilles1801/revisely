// What a take tells Sentry about itself (Revisely Dev only, environment `dev`; long takes, Nov 20 2026). Majd's take of
// Nov 19 ended without its final answer and Sentry heard nothing: leaving the reader removed the Stop trace. Now a take
// that ends without its final answer is reported when it ends, and so is each long take's numbers, which is how the
// 10-minute bar is measured on a phone rather than by feel. Numbers and event types only: no audio, no words.

import * as Sentry from '@sentry/react-native';
import { isDevVariant } from '../variant';
import type { TakeStats } from './takeStats';

/** A take this long or longer reports its numbers when it ends (s). */
export const LONG_TAKE_SECS = 180;

/** Why a take ended without its final answer: late after Stop, a failure after its start was found, or the screen left. */
export type UnfinishedWhy = 'late' | 'failed' | 'left';

export function reportUnfinishedTake(info: { why: UnfinishedWhy; mode: string; failure?: string | null; socket?: string; stats: TakeStats }): void {
  if (!isDevVariant()) return;
  Sentry.captureMessage('Recite: a take ended without its final answer', {
    level: 'warning',
    fingerprint: ['recite-take-unfinished'],
    tags: { recite_unfinished: info.why, recite_mode: info.mode, ...(info.failure ? { recite_failure: info.failure } : {}) },
    extra: { stats: info.stats, socket: info.socket ?? null },
  });
}

/** A long take's numbers, once it has ended (with its final answer or not). */
export function reportLongTake(info: { mode: string; unfinished: boolean; stats: TakeStats }): void {
  if (!isDevVariant() || info.stats.secs < LONG_TAKE_SECS) return;
  Sentry.captureMessage("Recite: a long take's numbers", {
    level: 'info',
    fingerprint: ['recite-long-take'],
    tags: {
      recite_mode: info.mode,
      recite_unfinished: String(info.unfinished),
      recite_minutes: String(Math.floor(info.stats.secs / 60)),
    },
    extra: { stats: info.stats },
  });
}
