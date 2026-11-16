// E2E builds only: the Dev app's one mic and live check (lib/reciteLive), without a microphone or the checker.
//
//   revisely://e2e/recite-live?on=1   the reader shows the one mic (for a tester), as in Revisely Dev
//   revisely://e2e/recite-live?on=0   back to the store app's record button
//
// A take plays a recorded event log instead of listening. Marking mistakes: An-Naml 23–24 on page 379 (the 1405
// print), from the page's top, with وَأُوتِيَتْ said as وَأُوهِيَتْ (a wrong word) and شَىْءٍ's tanween said as a shadda
// (a haraka slip), as Majd's Tarteel screenshots of Nov 14 2026. Recite (following only): An-Naml 25–26, begun in the
// middle of the page (Majd's start anywhere, Nov 14 2026). Either way the checker first finds where the take started
// (`locked`). Stop brings the checker's final answer at once.

import type { LiveConnect, ReplayLog, StartFrame } from '../reciteLive/feed';
import { replayFeed } from '../reciteLive/feed';

let on = false;

export function handleReciteLiveLink(url: string): boolean {
  const m = /^[a-z-]+:\/\/e2e\/recite-live\?on=([01])/.exec(url);
  if (!m) return false;
  on = m[1] === '1';
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
