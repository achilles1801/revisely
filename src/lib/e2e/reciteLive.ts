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
/** The stand-in checker has gone quiet once already (it does so only once a take). */
let wentQuiet = false;

export function handleReciteLiveLink(url: string): boolean {
  const m = /^[a-z-]+:\/\/e2e\/recite-live\?on=([01])/.exec(url);
  if (!m) return false;
  on = m[1] === '1';
  const long = /[?&]long=(\d+)/.exec(url);
  longMinutes = on && long ? Math.min(15, Number(long[1])) : 0;
  const quiet = /[?&]quiet=(\d+)/.exec(url);
  quietAt = longMinutes && quiet ? Number(quiet[1]) : null;
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
 * scripts/recite-check's live.py writes it.
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

const SAMPLE_RATE = 16_000;

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

/** The long take's events by seconds of audio: Majd's pace (a word every 1.1 s), a mark every 37 words, each ayah. */
function longEvents(minutes: number): { t: number; e: Record<string, unknown> }[] {
  const { getQuranWords } = require('../recite/quranWords') as typeof import('../recite/quranWords');
  const words = getQuranWords();
  if (!words) return [];
  // From An-Naml 23 on page 379 (the page E2E builds have an image of), on through the pages after it.
  const start = words.verseFirstWord(27, 23);
  const out: { t: number; e: Record<string, unknown> }[] = [{ t: 1.5, e: { type: 'locked', w: start, s: 27, a: 23 } }];
  let mistakes = 0;
  const marks: Record<string, unknown>[] = [];
  for (let i = 1, t = 2.6; t < minutes * 60; i++, t += 1.1) {
    const w = start + i;
    const r = words.ref(w);
    out.push({ t, e: { type: 'at', w, t } });
    out.push({ t: t + 0.05, e: { type: 'said', upTo: w - 2 } });
    if (w % 37 === 0) {
      const said = words.ref(w - 2);
      const mark = { id: `${w - 2}:word:sound`, w: w - 2, ayah: [said.sura, said.ayah], kind: 'word', detail: 'sound', heard: 'كذا', heardExact: false, sure: 'clear' };
      marks.push(mark);
      mistakes++;
      out.push({ t: t + 0.1, e: { type: 'mark', mark } });
    }
    out.push({ t: t + 0.15, e: { type: 'score', reached: i, mistakes, tajweed: 0, accuracy: 1 - mistakes / i } });
    if (words.verseFirstWord(r.sura, r.ayah) === w && r.ayah > 1) out.push({ t: t + 0.2, e: { type: 'ayah', s: r.sura, a: r.ayah - 1 } });
  }
  return out;
}

/**
 * The stand-in checker on the other end of the real socket: it answers `ready`, sends each event once it has received
 * the take's audio up to that event's time (as the checker hears and decides), beats every 2 s, and answers `end` with
 * the final answer. A resume (another instance, `from: 0`) sends everything again from the start once the audio comes
 * back. Once a take, at `quietAt` seconds of audio, it goes quiet without closing: only the phone's watchdog notices.
 */
class LongTakeChecker implements SocketLike {
  binaryType?: string;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e?: { code?: number }) => void) | null = null;
  onerror: ((e?: unknown) => void) | null = null;
  private got = 0;
  private next = 0;
  private quiet = false;
  private closed = false;
  private beat: ReturnType<typeof setInterval> | null = null;
  constructor(private readonly events: { t: number; e: Record<string, unknown> }[]) {
    setTimeout(() => this.onopen?.(), 80);
  }
  private emit(e: Record<string, unknown>) {
    if (!this.closed && !this.quiet) this.onmessage?.({ data: JSON.stringify(e) });
  }
  send(data: string | ArrayBuffer): void {
    if (this.closed) return;
    if (typeof data !== 'string') {
      this.got += data.byteLength / 2;
      const secs = this.got / SAMPLE_RATE;
      if (quietAt != null && !wentQuiet && secs >= quietAt) {
        wentQuiet = true;
        this.quiet = true;
        // eslint-disable-next-line no-console
        console.log(`[e2e] recite-live checker quiet at ${Math.round(secs)} s`);
      }
      while (this.next < this.events.length && this.events[this.next].t <= secs) this.emit(this.events[this.next++].e);
      return;
    }
    const frame = JSON.parse(data) as { type: string; resume?: string };
    if (frame.type === 'start') {
      setTimeout(() => {
        this.emit({ type: 'ready', v: 2, take: 'e2e-long', engine: 'e2e', protocol: 8, from: 0, beat: 2 });
        this.beat = setInterval(() => this.emit({ type: 'beat', t: this.got / SAMPLE_RATE, rx: this.got / SAMPLE_RATE }), 2000);
      }, 300);
      if (frame.resume) {
        // eslint-disable-next-line no-console
        console.log('[e2e] recite-live resumed');
      }
    } else if (frame.type === 'end') {
      setTimeout(() => {
        // What it heard: the events up to the audio received.
        const heard = this.events.slice(0, this.next);
        const marks = heard.filter((x) => x.e.type === 'mark').map((x) => x.e.mark);
        const last = [...heard].reverse().find((x) => x.e.type === 'at')?.e.w as number | undefined;
        const first = this.events[0]?.e.w as number;
        const score = [...heard].reverse().find((x) => x.e.type === 'score')?.e;
        this.emit({
          type: 'done',
          result: { v: 2, take: 'e2e-long', from: first, to: (last ?? first) + 1, start: first, secs: Math.round(this.got / SAMPLE_RATE), marks, score: score ? { ...score, type: undefined } : null },
        });
        this.emit({ type: 'into', names: [] });
      }, 800);
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
  const events = longEvents(longMinutes);
  return socketFeed({
    url: 'wss://e2e.invalid/live',
    pairUrl: null,
    token: async () => 'e2e',
    app: 'e2e long take',
    open: () => new LongTakeChecker(events),
  });
}
