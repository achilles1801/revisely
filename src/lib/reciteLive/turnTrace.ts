// Revisely Dev: each live take's trail of frames applied and page turns, kept on the account (J6, Nov 26 2026).
//
// Majd's revision-session take of Nov 26 (01:27Z, page 341) said the page's last word and the page didn't turn: the
// gold place stayed on a word from 11 s in while the checker's frames went on to the page's end. The same frames
// replayed through the session screen's tests turn the page, so what the real screen did is unknown. This trail says it:
// each frame received (or dropped while a re-check replays), each batch applied with the place and `said` after it, each
// page-turn decision (the place's and RECITE-30's), each page change the screen reported (a seek), and any stall of the
// JavaScript thread over STALL_MS.
//
// Numbers only: event types, word ids, pages, seconds. No audio, no text, no names. Written once per take, when it ends,
// to users/<uid>/reciteTraces/<take> (firestore.rules; revisely-dev only). Read with the dev admin key
// (`GOOGLE_APPLICATION_CREDENTIALS=~/secrets/revisely-dev-admin.json`). Remove it, and its rule, once J6 is confirmed fixed.

import { collection, doc, setDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import { logger } from '../logger';
import type { LiveEvent } from './contract';

export const TRACE_COLLECTION = 'reciteTraces';
/** Steps kept: the first HEAD, then the latest (a long take keeps its start and its end). */
export const MAX_STEPS = 800;
const HEAD = 100;
/** The heartbeat's interval, and a gap past it that counts as a stall of the JavaScript thread. */
export const BEAT_MS = 250;
export const STALL_MS = 1000;

export interface TurnTraceDoc {
  v: 1;
  /** The checker's take id (null if it never sent one). */
  take: string | null;
  /** The app's release, as the take's record names it. */
  app: string;
  /** When the take began (epoch ms). */
  at: number;
  /** `<seconds since the take began> <what>`, oldest first. */
  steps: string[];
  /** The longest stall of the JavaScript thread seen during the take (ms). */
  stall: number;
  /** Steps left out in the middle (past MAX_STEPS). */
  cut: number;
}

export interface TurnTrace {
  /** A new take: the trail starts again, and the heartbeat. */
  begin(): void;
  /** One step (nothing while no take is traced). */
  step(what: string): void;
  /** The take is over: the heartbeat stops and the trail is written once. */
  end(take: string | null): void;
  /** The trail so far (tests). */
  snapshot(): TurnTraceDoc | null;
}

/** A frame as a step: its type and numbers (word ids, the audio time), never a mark's text. */
export function eventStep(e: LiveEvent): string {
  const at = 't' in e && e.t != null ? ` t${e.t}` : '';
  switch (e.type) {
    case 'ready':
      return `ready p${e.protocol ?? '-'} from ${e.from ?? '-'}`;
    case 'locked':
      return `locked ${e.w} ${e.where ?? ''}${at}`;
    case 'at':
    case 'guess':
    case 'off':
      return `${e.type} ${e.w}${at}`;
    case 'word':
    case 'unword':
      return `${e.type} ${e.w} v${e.v}${at}`;
    case 'said':
      return `said ${e.upTo}`;
    case 'mark':
      return `mark ${e.mark.kind} ${e.mark.w}`;
    case 'unmark':
      return `unmark ${e.why}`;
    case 'ayah':
      return `ayah ${e.s}:${e.a}`;
    case 'error':
      return `error ${e.reason}`;
    default:
      return e.type;
  }
}

type Writer = (trace: TurnTraceDoc) => Promise<void>;

/** users/<uid>/reciteTraces/<take>, as the signed-in account (nothing when signed out). */
const writeToAccount: Writer = async (trace) => {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  const id = trace.take ?? `t${trace.at}`;
  await setDoc(doc(collection(db, 'users', uid, TRACE_COLLECTION), id), trace);
};

export function createTurnTrace({
  enabled,
  app,
  now = Date.now,
  write = writeToAccount,
}: {
  enabled: boolean;
  app: () => string;
  now?: () => number;
  write?: Writer;
}): TurnTrace {
  let cur: TurnTraceDoc | null = null;
  let beat: ReturnType<typeof setInterval> | null = null;
  let lastBeat = 0;
  const stopBeat = () => {
    if (beat) clearInterval(beat);
    beat = null;
  };
  const add = (what: string) => {
    if (!cur) return;
    const secs = ((now() - cur.at) / 1000).toFixed(1);
    if (cur.steps.length >= MAX_STEPS) {
      cur.steps.splice(HEAD, 1);
      cur.cut++;
    }
    cur.steps.push(`${secs} ${what}`);
  };
  return {
    begin() {
      if (!enabled) return;
      stopBeat();
      cur = { v: 1, take: null, app: app(), at: now(), steps: [], stall: 0, cut: 0 };
      lastBeat = now();
      beat = setInterval(() => {
        const t = now();
        const gap = t - lastBeat - BEAT_MS;
        lastBeat = t;
        if (!cur || gap <= 0) return;
        cur.stall = Math.max(cur.stall, gap);
        if (gap >= STALL_MS) add(`stall ${gap}ms`);
      }, BEAT_MS);
    },
    step(what) {
      add(what);
    },
    end(take) {
      stopBeat();
      const done = cur;
      cur = null;
      if (!done) return;
      done.take = take ?? done.take;
      write(done).catch((err) => logger.warn('Recite turn trace: not written', err));
    },
    snapshot() {
      return cur ? { ...cur, steps: [...cur.steps] } : null;
    },
  };
}
