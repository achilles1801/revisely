// The checker's first answer (`/check`, v1: lib/reciteCheck/result) as marks, so a recording checked after Stop shows
// on the page like a live take, until `/check?v=2` answers with marks itself (pure).

import type { CheckResult } from '../reciteCheck/result';
import type { QuranWords } from '../recite/quranWords';
import type { FinalResult, Mark, MarkDetail } from './contract';

const DETAIL: Record<string, MarkDetail> = { lookalike: 'lookalike', sound: 'sound', replaced: 'replaced', order: 'order' };

/** v1's words, extras, letters and tajweed notes as v2 marks (ids as the contract makes them). */
export function marksFromV1(result: CheckResult, words: QuranWords): Mark[] {
  const ayah = (w: number): [number, number] => {
    const r = words.ref(w);
    return [r.sura, r.ayah];
  };
  const out: Mark[] = [];
  for (const x of result.words) {
    if (x.status === 'missed') {
      out.push({ id: `${x.w}:skipped:`, w: x.w, ayah: ayah(x.w), kind: 'skipped', sure: 'clear', ...(x.t ? { t: x.t } : {}) });
    } else if (x.status === 'wrong') {
      const detail = x.kind ? DETAIL[x.kind] : undefined;
      out.push({
        id: `${x.w}:word:${detail ?? ''}`,
        w: x.w,
        ayah: ayah(x.w),
        kind: 'word',
        sure: 'clear',
        ...(detail ? { detail } : {}),
        ...(x.heard ? { heard: x.heard, heardExact: true } : {}),
        ...(x.t ? { t: x.t } : {}),
      });
    }
  }
  for (const e of result.extras) {
    out.push({
      id: `${e.after}:added:${e.trail ? 'trail' : ''}`,
      w: e.after,
      ayah: ayah(e.after),
      kind: 'added',
      sure: 'clear',
      ...(e.trail ? { detail: 'trail' as const } : {}),
    });
  }
  for (const l of result.letters ?? []) {
    out.push({ id: `${l.w}:letter:`, w: l.w, ayah: ayah(l.w), kind: 'letter', sure: 'clear' });
  }
  for (const n of result.tajweed) {
    out.push({
      id: `${n.w}:tajweed:${n.rule}`,
      w: n.w,
      ayah: ayah(n.w),
      kind: 'tajweed',
      rule: n.rule,
      sure: 'clear',
      ...(n.got != null ? { got: n.got } : {}),
      ...(n.expected != null ? { expected: n.expected } : {}),
    });
  }
  return out.sort((a, b) => a.w - b.w);
}

/** A v1 answer as the final answer of a take, with the model session's score rule (words reached). */
export function finalFromV1(result: CheckResult, words: QuranWords): FinalResult {
  const marks = marksFromV1(result, words);
  const ws = result.words.map((w) => w.w);
  const reached = ws.length ? Math.max(...ws) - Math.min(...ws) + 1 : 0;
  const mistakes = marks.filter((m) => m.kind !== 'tajweed').length;
  return {
    v: 2,
    take: null,
    from: result.from,
    to: result.to,
    secs: result.secs,
    marks,
    score: {
      reached,
      mistakes,
      tajweed: marks.length - mistakes,
      accuracy: reached > 0 ? Math.max(0, 1 - mistakes / reached) : 1,
    },
    kept: result.kept,
  };
}
