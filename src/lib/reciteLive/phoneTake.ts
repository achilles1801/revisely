// What a take checked on the phone leaves with the server (recite-contract.md draft 15), as plain data: its health line
// (`POST /line`, numbers only) and, on Revisely Dev with "Keep my recitations as test data" on, its result for the lab
// (`POST /keep`). lib/onDevice/takeReport sends them.

import type { StartFrame } from './feed';
import { EngineInfo, levelOf, WhereAnswer } from './where';

export interface PhoneTakeEnd {
  start: StartFrame;
  asked: WhereAnswer;
  /** The engine's final answer came, the take failed, or the reciter left before it. */
  how: 'done' | 'error' | 'left';
  /** The engine's name for the take (`ready`). */
  take: string | null;
  /** The engine's `health` frame, if it came. */
  health: Record<string, unknown> | null;
  /** The host's `meter` frame (recite_host.h): how the take kept up. */
  meter: Record<string, unknown> | null;
  audio: readonly Int16Array[];
  samples: number;
  /** The furthest word the take's `at` and `said` frames reached. */
  reached: number | null;
  /** `done`'s result. */
  result: Record<string, unknown> | null;
  /** The take's frames in order (held only for a kept take). */
  events: Record<string, unknown>[];
  dismissed: string[];
  /** As the server keeps them: [seconds into the take, the hint]. */
  hints: [number, { w: number; what: 'word' | 'ayah' }][];
}

// The server's checks (checker/server.py `phone_line`): one field outside them refuses the whole line.
const LINE_FIELDS = 80;
const LINE_NAME = /^[a-z][a-z0-9_]{0,31}$/;
const LINE_VERSION = /^[A-Za-z0-9._+ ()-]{1,48}$/;
const LINE_NUMBER_LIMIT = 1e12;
const LINE_ENDS = new Set(['end', 'too_long', 'error']);
/** Set here, whatever the engine's frame says. */
const OURS = new Set(['type', 'level', 'why', 'end', 'engine', 'pack', 'audio_s']);

const lineValue = (v: unknown): boolean =>
  v === null || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < LINE_NUMBER_LIMIT);

/** The take's health line. Null for the recorded stand-in, which judged nothing and so counts for nothing. */
export function lineFrom(
  end: PhoneTakeEnd,
  info: EngineInfo | null,
  extra: Record<string, number> = {},
): Record<string, unknown> | null {
  if (end.asked.why === 'replay') return null;
  const out: Record<string, unknown> = {
    level: levelOf(end.start),
    why: end.asked.why,
    audio_s: Math.round(end.samples / 1600) / 10,
  };
  const said = end.health?.end;
  const word = typeof said === 'string' && LINE_ENDS.has(said) ? said : end.how === 'done' ? 'end' : end.how === 'error' ? 'error' : null;
  if (word) out.end = word;
  if (info?.version && LINE_VERSION.test(info.version)) out.engine = info.version;
  if (info?.pack && LINE_VERSION.test(info.pack)) out.pack = info.pack;
  let fields = Object.keys(out).length;
  // The host's own numbers first: they stay if the engine's frame would fill the line.
  for (const [k, v] of [...Object.entries(extra), ...Object.entries(end.meter ?? {}), ...Object.entries(end.health ?? {})]) {
    if (fields >= LINE_FIELDS) break;
    if (OURS.has(k) || k in out || !LINE_NAME.test(k) || !lineValue(v)) continue;
    out[k] = v;
    fields++;
  }
  return out;
}

/** Characters, so that even text of two bytes a character stays under the server's 4 MB. */
const KEEP_JSON_CHARS = 2_000_000;

/** The result's half of `/keep`. A take too long to carry its frames goes without them; null if even that won't fit. */
export function keepBody(name: string, end: PhoneTakeEnd, info: EngineInfo | null): string | null {
  if (!end.result) return null;
  const doc = {
    take: name,
    result: end.result,
    request: end.start,
    engine: info?.version ?? null,
    pack: info?.pack ?? null,
    events: end.events as unknown[] | null,
    dismissed: end.dismissed,
    hints: end.hints,
  };
  const whole = JSON.stringify(doc);
  if (whole.length <= KEEP_JSON_CHARS) return whole;
  const lighter = JSON.stringify({ ...doc, events: null });
  return lighter.length <= KEEP_JSON_CHARS ? lighter : null;
}
