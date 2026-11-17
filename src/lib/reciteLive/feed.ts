// A live check's connection, as the screens see it: audio and a few text frames go out, events come back. The real
// one is the checker's WebSocket (`/live`, the server session's); until it's live, `replayFeed` plays a recorded
// event log (the model session's fixtures: the lab's live checker on public recitations with planted mistakes).

import { LiveEvent, parseEvent } from './contract';

export interface StartFrame {
  type: 'start';
  s: number;
  a: number;
  s2: number | null;
  a2: number | null;
  mon: number;
  mot: number;
  aar: number;
  letters: boolean;
  /** Check's Strict level: tajweed too (contract draft 4). */
  tajweed?: boolean;
  keep: boolean;
  /** Recite: follow along only, no marks (contract draft 5). Absent or false: Check. */
  follow?: boolean;
  /** Carry on a take after a dropped connection. */
  resume?: string;
  /**
   * The final answer at once, where the slips went after it (contract draft 8): `done` comes without `into`, and an
   * `into` event follows. Check takes send it; a server that doesn't read it sends one `done` with the names.
   */
  namesAfter?: boolean;
  /**
   * Start anywhere on the page (Majd, Nov 14 2026): the reciter starts at some word from s:a through the end of this
   * ayah (the page's last), and the checker finds where (`locked`). Absent: the take starts at s:a. A server that
   * doesn't read it starts at s:a, and its first `at` comes with no `locked` (lib/reciteLive/state).
   */
  startBy?: [number, number];
  /**
   * Recite anywhere in the Qur'an (protocol 7, Majd's step 2): beside `startBy`, the checker also looks in the whole
   * Qur'an when the page doesn't match, and locks there only on a place it is sure is the one (`locked.where`). Sent
   * for takes from the reader's mic only. A server before 7 ignores it.
   */
  startIn?: 'quran';
}

export type ClientFrame =
  | StartFrame
  /** A page turned by hand; with `startBy`, before the start is found: look for it on this page instead. */
  | { type: 'seek'; w: number; startBy?: [number, number] }
  | { type: 'dismiss'; id: string }
  /** A dismissed mark put back (Undo, the summary's Put back): the label is taken back. A checker without it ignores it. */
  | { type: 'undismiss'; id: string }
  /** A word or an ayah shown by hand in the hidden view (information for the checker). */
  | { type: 'hint'; w: number; what: 'word' | 'ayah' }
  | { type: 'end' };

export interface LiveConnection {
  /** 16 kHz mono PCM, as the microphone gives it. */
  sendAudio(pcm: Int16Array): void;
  send(frame: Exclude<ClientFrame, StartFrame>): void;
  /** Hang up (nothing more comes). */
  close(): void;
  /** The connection's state in a word or two, for the Stop trace (lib/reciteLive/stopTrace): "live", "retry 2", … */
  status?(): string;
  /** The take's audio from `from` to `to` seconds (16 kHz mono), as held on the phone; null outside what was heard. */
  audioClip?(from: number, to: number): Int16Array | null;
}

export interface LiveHandlers {
  onEvent(e: LiveEvent): void;
  /** The connection ended (after `done`, an error, or a drop). */
  onClose(): void;
}

export type LiveConnect = (start: StartFrame, handlers: LiveHandlers) => LiveConnection;

/** A recorded take: events with the seconds they came at. */
export interface ReplayLog {
  events: ({ t: number } & Record<string, unknown>)[];
}

interface Timers {
  set: (fn: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const realTimers: Timers = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/**
 * Plays `log` as if a checker were listening: each event at its time (÷ `speed`). Stop (`end`) brings the rest at
 * once, as the server sends its final answer after the last audio. Audio is ignored.
 */
export function replayFeed(log: ReplayLog, opts: { speed?: number; timers?: Timers } = {}): LiveConnect {
  const speed = opts.speed ?? 1;
  const timers = opts.timers ?? realTimers;
  return (_start, handlers) => {
    const events = log.events
      .map((raw, i) => ({ t: raw.t, i, e: parseEvent(raw) }))
      .filter((x): x is { t: number; i: number; e: LiveEvent } => x.e != null)
      .sort((a, b) => a.t - b.t || a.i - b.i);
    let next = 0;
    let closed = false;
    const handles = new Set<unknown>();
    // A recorded take whose names came after `done` (contract draft 8) ends with its `into`.
    const namesAfter = events.some((x) => x.e.type === 'into');
    const emit = (e: LiveEvent) => {
      if (closed) return;
      handlers.onEvent(e);
      if (e.type === 'error' || e.type === 'into' || (e.type === 'done' && !namesAfter)) close();
    };
    const close = () => {
      if (closed) return;
      closed = true;
      for (const h of handles) timers.clear(h);
      handles.clear();
      handlers.onClose();
    };
    for (const { t, e } of events) {
      const h = timers.set(() => {
        handles.delete(h);
        next++;
        emit(e);
      }, (t * 1000) / speed);
      handles.add(h);
    }
    return {
      sendAudio: () => undefined,
      send: (frame) => {
        if (frame.type !== 'end' || closed) return;
        for (const h of handles) timers.clear(h);
        handles.clear();
        // Everything still to come, in order: the server finishes the take and answers.
        const rest = events.slice(next);
        next = events.length;
        for (const { e } of rest) emit(e);
      },
      close,
    };
  };
}
