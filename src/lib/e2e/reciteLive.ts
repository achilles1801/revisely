// E2E builds only: the Dev app's one mic and live check (lib/reciteLive), without a microphone or the checker.
//
//   revisely://e2e/recite-live?on=1   the reader shows the one mic (for a tester), as in Revisely Dev
//   revisely://e2e/recite-live?on=0   back to the store app's record button
//   revisely://e2e/recite-live?on=1&long=10&quiet=300
//                                     a long take (long takes, Nov 20 2026): Mark mistakes from An-Naml 23 on page 379
//                                     on through the next pages for 10 minutes, through the real socket (lib/reciteLive/socket) to a stand-in
//                                     checker that beats, goes quiet once at 300 s of audio without closing (the phone's
//                                     watchdog must notice and resume, and the take is sent and replayed again), and
//                                     the microphone's frames 10 a second, decoded as the native module's are. The take's
//                                     numbers go to the E2E log ("[e2e] take stats").
//   revisely://e2e/recite-live?on=1&long=45&speed=5
//                                     a long session (RECITE-22): 45 minutes of recitation, its audio 5 times as fast as
//                                     a phone's (45 minutes in 9; the checker beats 5 times as often), through takes the phone chains: the stand-in checker
//                                     ends a take at 15 minutes of its audio as the real one does (`done.why: too_long`),
//                                     and a new take carries on from where the last one ended, finding the place first.
//
// A take plays a recorded event log instead of listening. Marking mistakes: An-Naml 23–24 on page 379 (the 1405
// print), from the page's top, with وَأُوتِيَتْ said as وَأُوهِيَتْ (a wrong word) and شَىْءٍ's tanween said as a shadda
// (a haraka slip), as Majd's Tarteel screenshots of Nov 14 2026. Recite (following only): An-Naml 25–26, begun in the
// middle of the page (Majd's start anywhere, Nov 14 2026). Either way the checker first finds where the take started
// (`locked`). Stop brings the checker's final answer at once.

import type { LiveConnect, ReplayLog, StartFrame } from '../reciteLive/feed';
import { replayFeed } from '../reciteLive/feed';
import { socketFeed, type SocketLike } from '../reciteLive/socket';

let on = false;
/** A long take's minutes (0: the recorded short takes), and the second of audio its checker goes quiet at (or none). */
let longMinutes = 0;
let quietAt: number | null = null;
/** A long take's audio this many times as fast as a phone's microphone (1: as a phone). */
let longSpeed = 1;
/** The stand-in checker has gone quiet once already (it does so only once a take). */
let wentQuiet = false;

export function handleReciteLiveLink(url: string): boolean {
  const m = /^[a-z-]+:\/\/e2e\/recite-live\?on=([01])/.exec(url);
  if (!m) return false;
  on = m[1] === '1';
  const long = /[?&]long=(\d+)/.exec(url);
  longMinutes = on && long ? Math.min(60, Number(long[1])) : 0;
  const quiet = /[?&]quiet=(\d+)/.exec(url);
  quietAt = longMinutes && quiet ? Number(quiet[1]) : null;
  const speed = /[?&]speed=(\d+)/.exec(url);
  longSpeed = longMinutes && speed ? Math.max(1, Math.min(10, Number(speed[1]))) : 1;
  // eslint-disable-next-line no-console
  console.log(`[e2e] recite-live ${on ? 'on' : 'off'}`);
  if (on) void putPage379();
  return true;
}

/**
 * E2E builds fetch no page images, and the marks are drawn on the page's own ink: page 379 (the 1405 print, its
 * public image) is put where the offline mushaf keeps it, for this device's set. It comes from the bundle itself as
 * base64 (fixtures/page379.ts says why), written with the legacy API.
 */
async function putPage379(): Promise<void> {
  try {
    const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const legacy = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const { pageImageSet } = require('../quranImages') as typeof import('../quranImages');
    const { PAGE_379_PNG_BASE64 } = require('./fixtures/page379') as typeof import('./fixtures/page379');
    const dir = new Directory(Paths.document, 'mushaf', pageImageSet());
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const target = new File(dir, '379.png');
    if (!target.exists) {
      await legacy.writeAsStringAsync(target.uri, PAGE_379_PNG_BASE64, { encoding: legacy.EncodingType.Base64 });
    }
    // eslint-disable-next-line no-console
    console.log('[e2e] recite-live page 379 on the phone');
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(`[e2e] recite-live page 379 not written: ${String(err)}`);
  }
}

export function e2eReciteLiveOn(): boolean {
  return on;
}

/** An-Naml 23's first word (QuranWords, the first on page 379), and its next ayahs'. */
const A23 = 48707;
const A24 = 48718;
/** An-Naml 25 and 26: the page's third and fourth ayat, where the Recite take begins. */
const A25 = 48735;
const A26 = 48749;

/**
 * Recite's take (`follow`), begun at An-Naml 25, mid-page: what the checker sends it is where it found the start, the
 * cursor and the words said, never a mark or a score, and a final answer of words only (no marks list), as
 * revisely-internal's checker/live.py writes it.
 */
function followTake(): ReplayLog {
  const events: ReplayLog['events'] = [
    { t: 0.3, type: 'ready', v: 2, take: 'e2e-379', engine: 'e2e', protocol: 6 },
    // Listening… until the checker is sure where the reciter started.
    { t: 2.5, type: 'locked', w: A25, s: 27, a: 25 },
  ];
  for (let i = 0; i <= 15; i++) {
    const w = A25 + i;
    const t = 2.6 + i * 0.8;
    events.push({ t, type: 'at', w });
    if (i >= 2) events.push({ t: t + 0.1, type: 'said', upTo: w - 2 });
  }
  events.push({
    t: 600,
    type: 'done',
    result: { v: 2, follow: true, take: 'e2e-379', from: A23, to: A26 + 2, start: A25, secs: 15, words: [], why: 'end' },
  });
  return { events };
}

/** The take's events: marking mistakes from the page's top, or following from its middle (`followTake`). */
function take(follow: boolean): ReplayLog {
  if (follow) return followTake();
  const events: ReplayLog['events'] = [
    { t: 0.3, type: 'ready', v: 2, take: 'e2e-379', engine: 'e2e', protocol: 6 },
    { t: 0.8, type: 'locked', w: A23, s: 27, a: 23 },
  ];
  const marks = [
    { id: `${A23 + 4}:word:sound`, w: A23 + 4, ayah: [27, 23], kind: 'word', detail: 'sound', heard: 'وَأُوهِيَتْ', heardExact: false, sure: 'likely' },
    { id: `${A23 + 7}:harakat:`, w: A23 + 7, ayah: [27, 23], kind: 'harakat', slip: { expected: 'ٍ', heard: 'ٌّ' }, sure: 'clear' },
  ];
  let mistakes = 0;
  for (let i = 0; i <= 14; i++) {
    const w = A23 + i;
    const t = 1 + i * 0.8;
    events.push({ t, type: 'at', w });
    if (i >= 2) {
      const said = w - 2;
      events.push({ t: t + 0.1, type: 'said', upTo: said });
      const m = marks.find((x) => x.w === said);
      if (m) {
        mistakes++;
        events.push({ t: t + 0.2, type: 'mark', mark: m });
      }
      events.push({ t: t + 0.3, type: 'score', reached: said - A23 + 1, mistakes, tajweed: 0, accuracy: 1 - mistakes / (said - A23 + 1) });
    }
  }
  events.push({
    t: 600,
    type: 'done',
    result: { v: 2, take: 'e2e-379', from: A23, to: A24 + 3, start: A23, secs: 13, marks, score: { reached: 15, mistakes: 2, tajweed: 0, accuracy: 13 / 15 } },
  });
  return { events };
}

/**
 * A second of the take's audio for its recording: a generated tone (220 Hz, louder and softer by the second), never a
 * recitation. The take's events are the recorded ones; only the recording needs samples.
 */
export function e2eToneSecond(second: number): Int16Array {
  const out = new Int16Array(16000);
  const amplitude = 1500 + 1500 * Math.abs(Math.sin(second / 2));
  for (let i = 0; i < out.length; i++) out[i] = Math.round(amplitude * Math.sin((2 * Math.PI * 220 * i) / 16000));
  return out;
}

/**
 * A Test me place's take (a span with an end, its start looked for in its first ayah): the reciter carries on after the
 * two words shown, says every word to the place's end with no mistake, and the take stops by itself there.
 */
function placeTake(start: StartFrame): ReplayLog | null {
  const { getQuranWords } = require('../recite/quranWords') as typeof import('../recite/quranWords');
  const words = getQuranWords();
  if (!words || start.s2 == null || start.a2 == null) return null;
  const first = words.verseFirstWord(start.s, start.a) + 2;
  const last = words.verseRange(start.s2, start.a2)[1] - 1;
  const events: ReplayLog['events'] = [
    { t: 0.3, type: 'ready', v: 2, take: 'e2e-place', engine: 'e2e', protocol: 6 },
    // A moment with only the two words shown, then the start found where the reciter carried on.
    { t: 4, type: 'locked', w: first, s: start.s, a: start.a },
  ];
  let t = 4.1;
  for (let w = first; w <= last; w++, t += 0.4) {
    events.push({ t, type: 'at', w });
    if (w - 1 >= first) events.push({ t: t + 0.1, type: 'said', upTo: w - 1 });
  }
  events.push({ t, type: 'said', upTo: last });
  events.push({
    t: 600,
    type: 'done',
    result: { v: 2, take: 'e2e-place', from: first - 2, to: last + 1, start: first, secs: Math.round(t), marks: [], score: { reached: last - first + 1, mistakes: 0, tajweed: 0, accuracy: 1 } },
  });
  return { events };
}

/** The recorded take, played as a checker would send it (a Test me place gets one of its own). */
export function e2eLiveConnect(): LiveConnect {
  return (start, handlers) => {
    const place = start.startBy && start.s2 != null ? placeTake(start) : null;
    return replayFeed(place ?? take(start.follow === true))(start, handlers);
  };
}


// ------------------------------------------------------------------------------------------------- the long take

export function e2eLongTakeMinutes(): number {
  return longMinutes;
}

/** How many of the microphone's frames go out at each tick (10 a second): `speed`. */
export function e2eLongSpeed(): number {
  return longSpeed;
}

const SAMPLE_RATE = 16_000;
/** The checker's cap on a take's audio (s): live.py's MAX_SECONDS. */
const CAP_SECONDS = 15 * 60;

/** A tenth of a second of a 220 Hz tone, as the native module sends it (base64 of little-endian samples). */
let toneFrame: string | null = null;
export function e2eToneFrameBase64(): string {
  if (toneFrame) return toneFrame;
  const pcm = new Int16Array(SAMPLE_RATE / 10);
  for (let i = 0; i < pcm.length; i++) pcm[i] = Math.round(2000 * Math.sin((2 * Math.PI * 220 * i) / SAMPLE_RATE));
  const bytes = new Uint8Array(pcm.buffer);
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  toneFrame = out;
  return out;
}

/** One moment of the long recitation: at `t` seconds of it, the cursor reaches a word, a word is decided, or a mark. */
type LongEvent = { t: number; w: number; kind: 'at' | 'said' | 'mark' };

/**
 * The long recitation by seconds of audio: Majd's pace (a word every 1.1 s), a breath after each ayah (the checker decides
 * its last word as the voice stops, `said`, before the next begins), a word said wrong every 37 words.
 */
function longEvents(minutes: number): LongEvent[] {
  const { getQuranWords } = require('../recite/quranWords') as typeof import('../recite/quranWords');
  const words = getQuranWords();
  if (!words) return [];
  // From An-Naml 23 on page 379 (the page E2E builds have an image of), on through the pages after it.
  const start = words.verseFirstWord(27, 23);
  const out: LongEvent[] = [];
  let t = 1.5;
  for (let w = start; t < minutes * 60; w++) {
    out.push({ t, w, kind: 'at' });
    if (w > start) out.push({ t: t + 0.05, w: w - 1, kind: 'said' });
    if (w % 37 === 0) out.push({ t: t + 0.1, w: w - 1, kind: 'mark' });
    const r = words.ref(w);
    const ayahEnd = words.verseRange(r.sura, r.ayah)[1] - 1 === w;
    if (ayahEnd) {
      // The breath: the ayah's last word decided as the voice stops, then a second of quiet.
      out.push({ t: t + 0.8, w, kind: 'said' });
      t += 2.1;
    } else t += 1.1;
  }
  return out;
}

/** The take the stand-in checker is on: where in the recitation its audio began (s), for a resume to carry on from. */
let takeBase = 0;
/** Where the takes that have ended left the recitation (s): a new take (not a resume) begins there. */
let chainAt = 0;

/**
 * The stand-in checker on the other end of the real socket: it answers `ready`, sends each event once it has received
 * the take's audio up to that event's time (as the checker hears and decides), beats every 2 s, and answers `end` with
 * the final answer. A resume (another instance, `from: 0`) sends everything again from the start once the audio comes
 * back. Once a take, at `quietAt` seconds of audio, it goes quiet without closing: only the phone's watchdog notices.
 *
 * Takes chain (RECITE-22): a take that isn't a resume begins where the last one ended, finds the place first (`locked`, a
 * second after the first word it hears), and judges and counts only its own words. At 15 minutes of a take's audio it
 * ends the take itself, as the real checker does (`done.why: "too_long"`).
 */
class LongTakeChecker implements SocketLike {
  binaryType?: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e?: { code?: number }) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  private got = 0;
  private next = 0;
  private base = 0;
  private started = false;
  private ended = false;
  private quiet = false;
  private closed = false;
  private beat: ReturnType<typeof setInterval> | null = null;
  /** The take's start once found, its words judged, its marks. */
  private lock: number | null = null;
  private reached = 0;
  private marks: Record<string, unknown>[] = [];
  private furthest: number | null = null;
  constructor(private readonly events: LongEvent[]) {
    setTimeout(() => this.onopen?.(), 80);
  }
  private emit(e: Record<string, unknown>) {
    if (!this.closed && !this.quiet) this.onmessage?.({ data: JSON.stringify(e) });
  }
  /** The recitation's events up to `secs` of it, as this take's (times from its own start). */
  private hear(secs: number) {
    const words = (require('../recite/quranWords') as typeof import('../recite/quranWords')).getQuranWords();
    while (this.next < this.events.length && this.events[this.next].t <= secs) {
      const ev = this.events[this.next];
      if (this.lock == null) {
        // Looking for the place: found a second after the first word this take hears.
        if (ev.kind !== 'at') {
          this.next++;
          continue;
        }
        if (secs < ev.t + 1) return;
        this.lock = ev.w;
        const r = words?.ref(ev.w);
        this.emit({ type: 'locked', w: ev.w, s: r?.sura, a: r?.ayah, t: ev.t - this.base });
      }
      this.next++;
      const t = ev.t - this.base;
      if (ev.kind === 'at') {
        if (ev.w < this.lock) continue;
        this.emit({ type: 'at', w: ev.w, t });
        this.reached++;
        this.furthest = ev.w;
        this.emit({ type: 'score', reached: this.reached, mistakes: this.marks.length, tajweed: 0, accuracy: 1 - this.marks.length / this.reached });
      } else if (ev.kind === 'said') {
        if (ev.w >= this.lock) this.emit({ type: 'said', upTo: ev.w, t });
      } else if (ev.w >= this.lock) {
        const r = words?.ref(ev.w);
        const mark = { id: `${ev.w}:word:sound`, w: ev.w, ayah: [r?.sura, r?.ayah], kind: 'word', detail: 'sound', heard: 'كذا', heardExact: false, sure: 'clear' };
        this.marks.push(mark);
        this.emit({ type: 'mark', mark, t });
      }
    }
  }
  /** The final answer: what this take heard, and why it ended. */
  private finish(why: 'end' | 'too_long') {
    if (this.ended) return;
    this.ended = true;
    chainAt = this.base + this.got / SAMPLE_RATE;
    const from = this.lock ?? 0;
    this.emit({
      type: 'done',
      result: {
        v: 2,
        take: `e2e-long-${Math.round(this.base)}`,
        from,
        to: (this.furthest ?? from) + 1,
        start: this.lock,
        secs: Math.round(this.got / SAMPLE_RATE),
        marks: this.marks,
        score: this.reached ? { reached: this.reached, mistakes: this.marks.length, tajweed: 0, accuracy: 1 - this.marks.length / this.reached } : null,
        why,
      },
    });
    this.emit({ type: 'into', names: [] });
  }
  send(data: string | ArrayBuffer): void {
    if (this.closed) return;
    if (typeof data !== 'string') {
      if (!this.started || this.ended) return;
      this.got = Math.min(this.got + data.byteLength / 2, CAP_SECONDS * SAMPLE_RATE);
      const secs = this.got / SAMPLE_RATE;
      if (quietAt != null && !wentQuiet && secs >= quietAt) {
        wentQuiet = true;
        this.quiet = true;
        // eslint-disable-next-line no-console
        console.log(`[e2e] recite-live checker quiet at ${Math.round(secs)} s`);
      }
      this.hear(this.base + secs);
      // The checker's cap: the take ends there, whatever the phone sends.
      if (secs >= CAP_SECONDS) {
        // eslint-disable-next-line no-console
        console.log('[e2e] recite-live checker cap reached');
        this.finish('too_long');
      }
      return;
    }
    const frame = JSON.parse(data) as { type: string; resume?: string };
    if (frame.type === 'start') {
      // A new take begins where the last one ended; a resume is the same take again from its start.
      if (!frame.resume) takeBase = chainAt;
      this.base = takeBase;
      this.next = this.events.findIndex((e) => e.t > this.base);
      if (this.next < 0) this.next = this.events.length;
      this.started = true;
      setTimeout(() => {
        this.emit({ type: 'ready', v: 2, take: `e2e-long-${Math.round(this.base)}`, engine: 'e2e', protocol: 8, from: 0, beat: 2, said: 'voice' });
        // Every 2 s of the take's audio: at `speed` that's more often by the clock, so the phone's paced catch-up (at most
        // 5 s past the checker's last `rx`) still drains held audio faster than it comes. At 2 s by the clock a new take's
        // held audio fell further behind at 6x, and the bar said Slow connection (flow 21's first run, Nov 22 2026).
        this.beat = setInterval(() => this.emit({ type: 'beat', t: this.got / SAMPLE_RATE, rx: this.got / SAMPLE_RATE }), 2000 / longSpeed);
      }, 300);
      if (frame.resume) {
        // eslint-disable-next-line no-console
        console.log('[e2e] recite-live resumed');
      }
    } else if (frame.type === 'end') {
      // The next take may start before this one's answer goes: it begins where this one's audio ended.
      chainAt = this.base + this.got / SAMPLE_RATE;
      setTimeout(() => this.finish('end'), 800);
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.beat) clearInterval(this.beat);
  }
}

/** The long take's connection: the real socket, the stand-in checker at its other end. */
export function e2eLongConnect(): LiveConnect {
  wentQuiet = false;
  takeBase = 0;
  chainAt = 0;
  const events = longEvents(longMinutes);
  return socketFeed({
    url: 'wss://e2e.invalid/live',
    pairUrl: null,
    token: async () => 'e2e',
    app: 'e2e long take',
    open: () => new LongTakeChecker(events),
  });
}

// ------------------------------------------------------------------------------------- the long take's numbers

/** The last long take's numbers, for the status line (E2ERoot): an E2E log isn't kept for a flow that passes. */
let statsLine = '';
const statsListeners = new Set<() => void>();
export function e2eTakeStatsLine(): string {
  return statsLine;
}
export function onE2ETakeStats(listener: () => void): () => void {
  statsListeners.add(listener);
  return () => statsListeners.delete(listener);
}
/** A take ended: its numbers, shortly (stall, event to screen, the checker's lag, the heap), once a long take ends. */
export function e2eTakeEnded(s: {
  secs: number;
  stallMax: number;
  stalls: number;
  applyMax: number;
  applyAvg: number;
  lagMax: number | null;
  quietMax: number;
  heapStart: number | null;
  heapMax: number | null;
  events: number;
}, links = 1): void {
  if (!longMinutes) return;
  const heap = s.heapStart != null && s.heapMax != null ? ` heap ${s.heapStart}→${s.heapMax}MB` : '';
  statsLine =
    `take ${s.secs}s links ${links} ev ${s.events} stall max ${Math.round(s.stallMax)}ms ×${s.stalls} ` +
    `apply ${s.applyAvg}/${s.applyMax}ms lag ${s.lagMax ?? '–'}s quiet ${Math.round(s.quietMax / 1000)}s${heap}`;
  for (const l of [...statsListeners]) l();
}
