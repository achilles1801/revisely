// The Recite engine on this phone (modules-dev/recite-engine, Revisely Dev's builds only): the bridge the local transport
// uses, and where takes go. A build with the stub, or with no data pack yet, has no open engine, so takes stay on the
// server (lib/reciteLive/where).
//
// What opens it: Recite's pack once it is whole on this phone (packRun), decrypted natively and read in place; else, for
// a build that carries the replay stand-in, a recorded take's frames at Documents/recite-replay/frames.jsonl.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';
import { getAuth } from 'firebase/auth';
import { AppState } from 'react-native';
import type { LiveConnect, StartFrame } from '../reciteLive/feed';
import type { EngineBridge } from '../reciteLive/localFeed';
import { clipSender } from '../reciteLive/clipSender';
import { routedFeed } from '../reciteLive/route';
import { chooseWhere, EngineInfo, isReplayEngine, parseEngineInfo, WhereAnswer } from '../reciteLive/where';
import { reciteWhere } from '../reciteLive/whereSettings';
import { benchRunning } from './benchBusy';
import { speedKeeper } from './speedCheck';
import { postSecond, reportPhoneTake } from './takeReport';
import { logger } from '../logger';
import { knownOffline } from '../networkState';
import { isDevVariant } from '../variant';
import { coreLine } from './coreInfo';
import { runEngineTest, type EngineTestRun } from './engineTest';
import { selfCheckFromOpen, type SelfCheck } from './selfCheck';

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
  const { engineStart, engineFeed, engineControl, engineFinish, engineClose, engineClip } = m;
  return {
    start: (frame) => engineStart.call(m, frame, openEngineInfo()?.hop ?? 0.5),
    feed: (take, pcm) => engineFeed.call(m, take, pcm),
    control: (take, frame) => engineControl.call(m, take, frame),
    finish: (take) => engineFinish.call(m, take),
    close: (take) => engineClose.call(m, take),
    ...(engineClip ? { clip: (take: number, s0: number, s1: number) => engineClip.call(m, take, s0, s1) } : {}),
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

let opening: Promise<void> | null = null;
/** Takes open now, wherever they run: releasing the engine closes every take, so the self-check never does it under one. */
let openTakes = 0;
/** What the last open of a pack came to: the bench records its self-check, a refused open included. */
let lastPackOpen: { packId: string; opened: { ok: boolean; code: number; error?: string; info?: string } } | null = null;
/** A pack that didn't open this run for another reason than its data (memory, a model): not decrypted again until the next. */
let refusedPack: string | null = null;
const RC_ERR_DATA = -2;
/** enginePackOpen: the sealed files failed the reader's checks before rc_open (a damaged file, a lost key). */
const PACK_DAMAGED = -20;

/** Opens the engine from the pack when it is here. True once it is open. */
async function openFromPack(m: Native): Promise<boolean> {
  if (!m.enginePackOpen) return false;
  const core = coreLine(m);
  // Neither the stub nor the replay stand-in can read a pack: it isn't decrypted for them, and they never get to call it bad.
  if (!core || core.stub || core.replay || core.failed) return false;
  const run = require('./packRun') as typeof import('./packRun');
  await run.preparePack();
  const pack = run.packForEngine();
  if (!pack || pack.packId === refusedPack) return false;
  const r = await m.enginePackOpen(pack.dir, pack.packId, pack.parts, engineOptions());
  lastPackOpen = { packId: pack.packId, opened: r };
  if (r.ok) return true;
  logger.warn(`Recite engine: the pack didn't open (${r.code}): ${r.error ?? ''}`);
  if (r.code === RC_ERR_DATA) await run.dropBadPack(pack.packId);
  else if (r.code === PACK_DAMAGED) await run.refetchDamagedPack(pack.packId);
  else refusedPack = pack.packId;
  return false;
}

/** The replay stand-in's recorded frames, for a build that carries it. */
async function openFromReplay(m: Native): Promise<void> {
  if (!m.engineOpenFiles) return;
  let replay: File;
  try {
    replay = new File(Paths.document, 'recite-replay', 'frames.jsonl');
    if (!replay.exists) return;
  } catch {
    return;
  }
  const r = await m.engineOpenFiles([{ name: 'frames.jsonl', path: replay.uri }], engineOptions());
  if (!r.ok) logger.warn(`Recite engine: didn't open (${r.code}): ${r.error ?? ''}`);
}

/** Opens the engine if there is something to open it with; resolves once that is done. Never rejects. */
function openNow(): Promise<void> {
  if (opening) return opening;
  const m = native();
  if (!m || openEngineInfo()) return Promise.resolve();
  opening = (async () => {
    try {
      if (!(await openFromPack(m))) await openFromReplay(m);
    } catch (err) {
      logger.warn('Recite engine: open failed', err);
    } finally {
      opening = null;
    }
  })();
  return opening;
}

/** Opens the engine in the background if there is something to open it with. Never throws. */
export function warmEngine(): void {
  void openNow();
}

/**
 * The self-check of the pack on this phone, for the bench's record (ONDEV-1); null with no pack. An engine this opened
 * is closed again, so the bench's memory figures don't carry it, unless a take has started on it meanwhile.
 */
export async function engineSelfCheck(): Promise<SelfCheck | null> {
  const m = native();
  if (!m) return null;
  const wasOpen = !!openEngineInfo();
  await openNow();
  const last = lastPackOpen;
  if (!wasOpen && openTakes === 0 && openEngineInfo()) await m.engineRelease?.();
  // Damaged files say nothing about how the models run on this phone.
  return last && last.opened.code !== PACK_DAMAGED ? selfCheckFromOpen(last.opened, last.packId) : null;
}

/**
 * A Strict take of a recording on this phone's real engine, for the bench (engineTest.ts); null with no real engine, or
 * with a take already running. It counts as a take, so the speed check stays out of it, and an engine this opened closes
 * again afterwards.
 */
export async function engineStrictTest(
  pcm: Int16Array,
  keepGoing: () => boolean,
  onProgress?: (doneSec: number, totalSec: number) => void,
): Promise<EngineTestRun | null> {
  const m = native();
  const bridge = engineBridge();
  if (!m || !bridge || openTakes > 0) return null;
  const wasOpen = !!openEngineInfo();
  await openNow();
  const info = openEngineInfo();
  if (!info || isReplayEngine(info) || openTakes > 0) {
    if (!wasOpen && openTakes === 0 && info) await m.engineRelease?.();
    return null;
  }
  openTakes += 1;
  speed.takeOpened();
  try {
    return await runEngineTest({
      bridge,
      pcm,
      hop: info.hop ?? null,
      peakMb: () => m.memoryPeakMb?.() ?? 0,
      now: () => Date.now(),
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
      keepGoing: () => AppState.currentState === 'active' && keepGoing(),
      onProgress,
    });
  } finally {
    openTakes = Math.max(0, openTakes - 1);
    speed.takeClosed();
    if (!wasOpen && openTakes === 0 && openEngineInfo()) await m.engineRelease?.();
  }
}

export function __resetEngineForTests(): void {
  opening = null;
  lastPackOpen = null;
  openTakes = 0;
  refusedPack = null;
}

/** The engine's threads (the bench: 1 misses the live pace on a Galaxy A15). Part of the speed result's key. */
const ENGINE_THREADS = 2;
const SPEED_KEY = '@revisely_recite_speed';

/** The phone's speed check (lib/onDevice/speedCheck). A build without `engineProbe` never measures, so `auto` stays on the server. */
const speed = speedKeeper({
  info: openEngineInfo,
  device: () => {
    try {
      return native()?.deviceInfo() ?? null;
    } catch {
      return null;
    }
  },
  threads: ENGINE_THREADS,
  probe: async () => {
    const m = native();
    return m?.engineProbe ? m.engineProbe() : null;
  },
  active: () => AppState.currentState === 'active' && !benchRunning(),
  read: () => AsyncStorage.getItem(SPEED_KEY),
  write: (json) => AsyncStorage.setItem(SPEED_KEY, json),
  reopen: () => {
    const m = native();
    if (!m?.engineRelease) return;
    m.engineRelease()
      .then(() => warmEngine())
      .catch((err: unknown) => logger.warn('Recite engine: reopening failed', err));
  },
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  later: (fn, ms) => setTimeout(fn, ms),
  cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
  log: (message) => logger.log(message),
});

/** The stored result, read once, the first time a Dev screen or take asks (never as this file is imported). */
let speedLoaded = false;
function loadSpeed(): void {
  if (speedLoaded) return;
  speedLoaded = true;
  void speed.load();
}

/** What the engine opens with: the threads, and this phone's hop once it has been measured. */
export function engineOptions(): string {
  const hop = speed.hop();
  return JSON.stringify({ threads: ENGINE_THREADS, ...(hop ? { hop } : {}) });
}

/** The take every phone can be asked about: Mark mistakes, anywhere on a page (Settings' line). */
const TYPICAL: StartFrame = {
  type: 'start', s: 2, a: 6, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: true, tajweed: false, keep: false,
  namesAfter: true, startBy: [2, 16], startIn: 'quran', guess: true,
};

/** Where a typical take would run now, and why (Settings → Testing). */
export function whereNow(): WhereAnswer {
  loadSpeed();
  return chooseWhere({ ...reciteWhere(), engine: openEngineInfo(), fastEnough: speed.fastEnough(), demoted: speed.demoted(), start: TYPICAL });
}

/** Revisely Dev's takes: each to the phone or the server. */
export function deviceConnect(server: LiveConnect): LiveConnect {
  loadSpeed();
  return routedFeed({
    server,
    engine: engineBridge,
    info: openEngineInfo,
    fastEnough: speed.fastEnough,
    demoted: speed.demoted,
    settings: reciteWhere,
    warm: () => {
      warmEngine();
      speed.schedule();
    },
    canClip: () => !knownOffline() && !!getAuth().currentUser,
    clips: (hooks) =>
      clipSender({
        ...hooks,
        post: postSecond,
        online: () => !knownOffline(),
        later: (fn, ms) => setTimeout(fn, ms),
        cancel: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      }),
    onTakeOpen: () => {
      openTakes += 1;
      speed.takeOpened();
    },
    onTakeClose: () => {
      openTakes = Math.max(0, openTakes - 1);
      speed.takeClosed();
    },
    onPhoneEnd: (end) => {
      const info = openEngineInfo();
      const steps = speed.steps();
      void reportPhoneTake(end, info, { ...(info?.hop ? { hop: info.hop } : {}), ...(steps ? { demoted: steps } : {}) });
      speed.noteTake(end.meter);
    },
    onRouted: (answer) => logger.log(`Recite: on the ${answer.on} (${answer.why}${answer.detail ? `: ${answer.detail}` : ''})`),
  });
}
