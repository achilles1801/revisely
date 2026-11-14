// E2E builds only: the Dev app's one mic and live check (lib/reciteLive), without a microphone or the checker.
//
//   revisely://e2e/recite-live?on=1   the reader shows the one mic (for a tester), as in Revisely Dev
//   revisely://e2e/recite-live?on=0   back to the store app's record button
//
// A take plays a recorded event log instead of listening: An-Naml 23–24 on page 379 (the 1405 print), with وَأُوتِيَتْ
// said as وَأُوهِيَتْ (a wrong word) and شَىْءٍ's tanween said as a shadda (a haraka slip), as Majd's Tarteel
// screenshots of Nov 14 2026. Stop brings the checker's final answer at once.

import type { LiveConnect, ReplayLog } from '../reciteLive/feed';
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
 * public image from the app's Storage) is put where the offline mushaf keeps it, for this device's set. Copied with
 * the legacy API, which may read the app bundle (lib/recite/quranWords' readText says why). The PNG ships as `.dat`:
 * an Android release build keeps a `.png` asset as a drawable, which the file API can't copy ("No resource found");
 * a `.dat` is a raw file, as the word data is.
 */
async function putPage379(): Promise<void> {
  try {
    const { Asset } = require('expo-asset') as typeof import('expo-asset');
    const { Directory, File, Paths } = require('expo-file-system') as typeof import('expo-file-system');
    const legacy = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
    const { pageImageSet } = require('../quranImages') as typeof import('../quranImages');
    const asset = Asset.fromModule(require('./fixtures/page379.dat'));
    if (!asset.localUri) await asset.downloadAsync();
    const dir = new Directory(Paths.document, 'mushaf', pageImageSet());
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const target = new File(dir, '379.png');
    if (!target.exists) await legacy.copyAsync({ from: asset.localUri ?? asset.uri, to: target.uri });
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

/** An-Naml 23's first word (QuranWords), and its next ayah's. */
const A23 = 48707;
const A24 = 48718;

function take(): ReplayLog {
  const events: ReplayLog['events'] = [{ t: 0.3, type: 'ready', v: 2, take: 'e2e-379', engine: 'e2e' }];
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
    result: { v: 2, take: 'e2e-379', from: A23, to: A24 + 3, secs: 13, marks, score: { reached: 15, mistakes: 2, tajweed: 0, accuracy: 13 / 15 } },
  });
  return { events };
}

/** The recorded take, played as a checker would send it. */
export function e2eLiveConnect(): LiveConnect {
  return replayFeed(take());
}
