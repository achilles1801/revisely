// A take checked on the phone never opens the checker's socket, so what the server would have noted of it is sent here,
// after the take (recite-contract.md draft 15): one health line, and with "Help improve mistake detection" on (RECITE-26),
// the take's audio and result for the lab. Best effort and never in the reciter's way: a failure is logged and
// nothing is retried, and a service without these routes answers 404, which means there is nothing to send.

import { File, Paths } from 'expo-file-system';
import { createUploadTask, FileSystemSessionType, FileSystemUploadType } from 'expo-file-system/legacy';
import { getAuth } from 'firebase/auth';
import { getAppCheckToken } from '../appCheck';
import { logger } from '../logger';
import { currentRelease } from '../releaseInfo';
import { RECITE_CHECK_URL, sendLabel } from '../reciteCheck/service';
import { wavHeader } from '../reciteCheck/wav';
import type { SecondClip } from '../reciteLive/clipSender';
import { keepBody, lineFrom, type PhoneTakeEnd } from '../reciteLive/phoneTake';
import type { EngineInfo } from '../reciteLive/where';

/** The server's longest take. */
const MAX_KEEP_SAMPLES = 15 * 60 * 16_000;
/** Chunks written between giving the JS thread back. */
const WRITE_BURST = 200;
/** Takes whose kept name a late "Not a mistake" may still ask for. */
const KEPT_NAMES = 8;

export interface ReportDeps {
  /** Sign-in and App Check, as `/check` sends them; null when signed out. */
  headers(): Promise<Record<string, string> | null>;
  post(path: string, headers: Record<string, string>, body: string): Promise<{ ok: boolean; status: number }>;
  /** The take's audio as a WAV, to `/keep`, from a file so it never sits in memory twice. */
  postWav(end: PhoneTakeEnd, headers: Record<string, string>): Promise<{ status: number; body: string }>;
  label: typeof sendLabel;
}

async function writeWav(end: PhoneTakeEnd): Promise<File> {
  const file = new File(Paths.cache, `recite-keep-${Date.now()}.wav`);
  file.create({ overwrite: true });
  const handle = file.open();
  try {
    handle.writeBytes(wavHeader(end.samples * 2));
    let written = 0;
    for (const c of end.audio) {
      handle.writeBytes(new Uint8Array(c.buffer, c.byteOffset, c.byteLength));
      if (++written % WRITE_BURST === 0) await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    handle.close();
  }
  return file;
}

const defaults: ReportDeps = {
  headers: async () => {
    const r = currentRelease();
    const token = await getAuth().currentUser?.getIdToken();
    if (!token) return null;
    const appCheck = await getAppCheckToken().catch(() => null);
    return {
      Authorization: `Bearer ${token}`,
      'X-Revisely-App': `${r.version ?? '?'} (${r.build ?? '?'}) ${r.channel ?? 'dev'} ${r.updateShort ?? 'embedded'}`,
      ...(appCheck ? { 'X-Firebase-AppCheck': appCheck } : {}),
    };
  },
  post: async (path, headers, body) => {
    const res = await fetch(`${RECITE_CHECK_URL}${path}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body,
    });
    return { ok: res.ok, status: res.status };
  },
  postWav: async (end, headers) => {
    const file = await writeWav(end);
    try {
      const task = createUploadTask(`${RECITE_CHECK_URL}/keep`, file.uri, {
        httpMethod: 'POST',
        uploadType: FileSystemUploadType.BINARY_CONTENT,
        sessionType: FileSystemSessionType.FOREGROUND,
        headers: { ...headers, 'Content-Type': 'audio/wav' },
      });
      const result = await task.uploadAsync();
      return { status: result?.status ?? 0, body: result?.body ?? '' };
    } finally {
      try {
        file.delete();
      } catch (err) {
        logger.warn('Recite: a kept take’s temporary file stayed', err);
      }
    }
  },
  label: sendLabel,
};

/** One call to `/second` (recite-contract.md draft 14). A signed-out phone gets what the server would say. */
export async function postSecond(clips: SecondClip[], timeoutMs: number): Promise<{ status: number; results?: unknown }> {
  const headers = await defaults.headers();
  if (!headers) return { status: 401 };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(`${RECITE_CHECK_URL}/second`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clips }),
      signal: abort.signal,
    });
    if (!res.ok) return { status: res.status };
    const body = (await res.json()) as { results?: unknown };
    return { status: res.status, results: body.results };
  } finally {
    clearTimeout(timer);
  }
}

async function sendLine(end: PhoneTakeEnd, info: EngineInfo | null, extra: Record<string, number>, d: ReportDeps): Promise<void> {
  const line = lineFrom(end, info, extra);
  if (!line) return;
  const headers = await d.headers();
  if (!headers) return;
  const res = await d.post('/line', headers, JSON.stringify(line));
  if (!res.ok && res.status !== 404) logger.warn(`Recite: the take's line was refused (${res.status})`);
}

/** The server's name for the kept take, or null if nothing was kept. The audio goes once, and never again after it landed. */
async function keepTake(end: PhoneTakeEnd, info: EngineInfo | null, d: ReportDeps): Promise<string | null> {
  if (end.samples <= 0 || end.samples > MAX_KEEP_SAMPLES) return null;
  const headers = await d.headers();
  if (!headers) return null;
  const audio = await d.postWav(end, headers);
  if (audio.status !== 200) {
    if (audio.status !== 404) logger.warn(`Recite: the kept take's audio was refused (${audio.status})`);
    return null;
  }
  const name = (JSON.parse(audio.body) as { take?: unknown }).take;
  if (typeof name !== 'string') return null;
  const body = keepBody(name, end, info);
  if (!body) return null;
  const res = await d.post('/keep', headers, body);
  if (res.ok || res.status === 409) return name;
  logger.warn(`Recite: the kept take's result was refused (${res.status})`);
  return null;
}

const keptNames = new Map<string, Promise<string | null>>();

/** After a phone take ends. Never throws, and returns once its line and kept take have gone. */
export async function reportPhoneTake(
  end: PhoneTakeEnd,
  info: EngineInfo | null,
  extra: Record<string, number> = {},
  d: ReportDeps = defaults,
): Promise<void> {
  const line = sendLine(end, info, extra, d).catch((err: unknown) => logger.warn('Recite: the take’s line was not sent', err));
  let kept: Promise<unknown> = Promise.resolve();
  if (end.how === 'done' && end.start.keep && end.result && end.take) {
    const name = keepTake(end, info, d).catch((err: unknown) => {
      logger.warn('Recite: the take was not kept', err);
      return null;
    });
    keptNames.set(end.take, name);
    while (keptNames.size > KEPT_NAMES) keptNames.delete(keptNames.keys().next().value as string);
    kept = name;
  }
  await Promise.all([line, kept]);
}

/** "Not a mistake", or taking it back, after a phone take's final answer: a label beside its kept copy, once there is one. */
export async function labelPhoneTake(
  what: 'dismiss' | 'undismiss',
  take: string,
  id: string,
  when: number,
  d: Pick<ReportDeps, 'label'> = defaults,
): Promise<boolean> {
  const name = await keptNames.get(take);
  return name ? d.label(what, name, id, when) : false;
}

export function resetTakeReportForTests(): void {
  keptNames.clear();
}
