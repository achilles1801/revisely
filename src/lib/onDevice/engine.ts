// The Recite engine on this phone (modules-dev/recite-engine, Revisely Dev's builds only): the bridge the local transport
// uses, and where takes go. A build with the stub, or with no data pack yet, has no open engine, so takes stay on the
// server (lib/reciteLive/where).
//
// What opens it today: a recorded take's frames at Documents/recite-replay/frames.jsonl, for a build that carries the
// replay stand-in. The data pack (lib/recitePack, A3) opens it the same way once it is on the phone.

import { File, Paths } from 'expo-file-system';
import type { LiveConnect, StartFrame } from '../reciteLive/feed';
import type { EngineBridge } from '../reciteLive/localFeed';
import { routedFeed } from '../reciteLive/route';
import { chooseWhere, EngineInfo, parseEngineInfo, WhereAnswer } from '../reciteLive/where';
import { reciteWhere } from '../reciteLive/whereSettings';
import { logger } from '../logger';
import { isDevVariant } from '../variant';

type EngineModule = typeof import('../../../modules-dev/recite-engine');
type Native = NonNullable<EngineModule['default']>;

function native(): Native | null {
  if (!isDevVariant()) return null;
  try {
    return (require('../../../modules-dev/recite-engine') as EngineModule).default ?? null;
  } catch {
    return null;
  }
}

/** The native engine for the transport; null in the store app and in Dev builds from before it. */
export function engineBridge(): EngineBridge | null {
  const m = native();
  if (!m?.engineStart || !m.engineFeed || !m.engineControl || !m.engineFinish || !m.engineClose) return null;
  const { engineStart, engineFeed, engineControl, engineFinish, engineClose } = m;
  return {
    start: (frame) => engineStart.call(m, frame),
    feed: (take, pcm) => engineFeed.call(m, take, pcm),
    control: (take, frame) => engineControl.call(m, take, frame),
    finish: (take) => engineFinish.call(m, take),
    close: (take) => engineClose.call(m, take),
    onFrames: (listener) => {
      const sub = m.addListener('onEngineFrames', listener);
      return () => sub.remove();
    },
  };
}

/** The open engine's rc_info; null while none is open. */
export function openEngineInfo(): EngineInfo | null {
  const m = native();
  return m?.engineInfo ? parseEngineInfo(m.engineInfo()) : null;
}

let opening = false;

/** Opens the engine in the background if there is something to open it with. Never throws. */
export function warmEngine(): void {
  const m = native();
  if (opening || !m?.engineOpenFiles || openEngineInfo()) return;
  let replay: File;
  try {
    replay = new File(Paths.document, 'recite-replay', 'frames.jsonl');
    if (!replay.exists) return;
  } catch {
    return;
  }
  opening = true;
  m.engineOpenFiles([{ name: 'frames.jsonl', path: replay.uri }], '{}')
    .then((r) => {
      if (!r.ok) logger.warn(`Recite engine: didn't open (${r.code}): ${r.error ?? ''}`);
    })
    .catch((err: unknown) => logger.warn('Recite engine: open failed', err))
    .finally(() => {
      opening = false;
    });
}

/**
 * Whether this phone passed its speed check. Nothing measures it at load yet, so `auto` keeps takes on the server;
 * Settings → Testing and an account's pin can still choose the phone.
 */
const fastEnough = (): boolean | null => null;

/** The take every phone can be asked about: Mark mistakes, anywhere on a page (Settings' line). */
const TYPICAL: StartFrame = {
  type: 'start', s: 2, a: 6, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: true, tajweed: false, keep: false,
  namesAfter: true, startBy: [2, 16], startIn: 'quran', guess: true,
};

/** Where a typical take would run now, and why (Settings → Testing). */
export function whereNow(): WhereAnswer {
  return chooseWhere({ ...reciteWhere(), engine: openEngineInfo(), fastEnough: fastEnough(), start: TYPICAL });
}

/** Revisely Dev's takes: each to the phone or the server. */
export function deviceConnect(server: LiveConnect): LiveConnect {
  return routedFeed({
    server,
    engine: engineBridge,
    info: openEngineInfo,
    fastEnough,
    settings: reciteWhere,
    warm: warmEngine,
    onRouted: (answer) => logger.log(`Recite: on the ${answer.on} (${answer.why}${answer.detail ? `: ${answer.detail}` : ''})`),
  });
}
