import type { StartFrame } from '../../reciteLive/feed';
import { keepBody, lineFrom, PhoneTakeEnd } from '../../reciteLive/phoneTake';
import { labelPhoneTake, reportPhoneTake, ReportDeps, resetTakeReportForTests } from '../takeReport';

jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
jest.mock('expo-file-system/legacy', () => ({ createUploadTask: jest.fn(), FileSystemSessionType: {}, FileSystemUploadType: {} }));
jest.mock('firebase/auth', () => ({ getAuth: jest.fn() }));
jest.mock('../../appCheck', () => ({ getAppCheckToken: jest.fn() }));
jest.mock('../../reciteCheck/service', () => ({ RECITE_CHECK_URL: 'https://checker.test', sendLabel: jest.fn() }));

const START: StartFrame = { type: 'start', s: 2, a: 6, s2: null, a2: null, mon: 4, mot: 4, aar: 0, letters: true, keep: false };
const INFO = { version: 'recite-core 0.1.0 (abc1234)', pack: 'v7m-1' };

const end = (over: Partial<PhoneTakeEnd> = {}): PhoneTakeEnd => ({
  start: START,
  asked: { on: 'phone', why: 'config' },
  how: 'done',
  take: 'e1',
  health: { type: 'health', hop: 0.5, worst_hop_ms: 212.5, marks: 3, late: false, none_yet: null },
  meter: null,
  audio: [new Int16Array(16000)],
  samples: 16000,
  reached: 40,
  result: { v: 2, score: 91 },
  events: [{ type: 'ready' }],
  dismissed: ['m1'],
  hints: [[1.25, { w: 40, what: 'word' }]],
  ...over,
});

function fakes(over: Partial<ReportDeps> = {}) {
  const posts: { path: string; body: unknown }[] = [];
  const wavs: PhoneTakeEnd[] = [];
  const d: ReportDeps = {
    headers: async () => ({ Authorization: 'Bearer t' }),
    post: async (path, _h, body) => {
      posts.push({ path, body: JSON.parse(body) });
      return { ok: true, status: 200 };
    },
    postWav: async (e) => {
      wavs.push(e);
      return { status: 200, body: JSON.stringify({ ok: true, take: 'kept-1' }) };
    },
    label: jest.fn(async () => true),
    ...over,
  };
  return { d, posts, wavs };
}

beforeEach(() => resetTakeReportForTests());

describe('[ONDEV-4] the health line', () => {
  it('holds the level, why, versions and the engine’s numbers', () => {
    expect(lineFrom(end(), INFO)).toEqual({
      level: 'harakat',
      why: 'config',
      audio_s: 1,
      end: 'end',
      engine: INFO.version,
      pack: 'v7m-1',
      hop: 0.5,
      worst_hop_ms: 212.5,
      marks: 3,
      late: false,
      none_yet: null,
    });
  });

  it('never carries text, an id, or a field the server would refuse the whole line for', () => {
    const line = lineFrom(
      end({ health: { type: 'health', word: 'بسم', take: 'abc', Bad: 1, 'a-b': 2, big: 1e13, inf: Infinity, ok: 7, ['x'.repeat(33)]: 1 } }),
      { version: 'bad/version', pack: 'p'.repeat(49) },
    ) as Record<string, unknown>;
    expect(line).toEqual({ level: 'harakat', why: 'config', audio_s: 1, end: 'end', ok: 7 });
  });

  it('the host’s own numbers win over the engine’s, and carry the step down', () => {
    const line = lineFrom(
      end({ meter: { type: 'meter', hops: 40, late_hops: 3, worst_hop_ms: 480, max_lag_s: 0.25, thermal_end: 1 } }),
      INFO,
      { demoted: 1, hop: 1 },
    ) as Record<string, unknown>;
    expect(line).toMatchObject({ hops: 40, late_hops: 3, worst_hop_ms: 480, max_lag_s: 0.25, thermal_end: 1, demoted: 1, hop: 1 });
    expect(line).not.toHaveProperty('type');
  });

  it('stays within the server’s 80 fields', () => {
    const health = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [`f${i}`, i]));
    expect(Object.keys(lineFrom(end({ health }), INFO) as object)).toHaveLength(80);
  });

  it('says how the take ended', () => {
    expect(lineFrom(end({ how: 'error', health: null }), null)?.end).toBe('error');
    expect(lineFrom(end({ how: 'left', health: null }), null)).not.toHaveProperty('end');
    expect(lineFrom(end({ health: { end: 'too_long' } }), null)?.end).toBe('too_long');
  });

  it('a recorded stand-in counts for nothing', () => {
    expect(lineFrom(end({ asked: { on: 'phone', why: 'replay' } }), INFO)).toBeNull();
  });
});

describe('[ONDEV-4] the kept take', () => {
  const keptEnd = (over: Partial<PhoneTakeEnd> = {}) => end({ start: { ...START, keep: true }, ...over });

  it('sends one line and nothing else when Keep is off', async () => {
    const f = fakes();
    await reportPhoneTake(end(), INFO, {}, f.d);
    expect(f.posts.map((p) => p.path)).toEqual(['/line']);
    expect(f.wavs).toHaveLength(0);
  });

  it('with Keep on: the audio once, then its result under the server’s name', async () => {
    const f = fakes();
    await reportPhoneTake(keptEnd(), INFO, {}, f.d);
    expect(f.wavs).toHaveLength(1);
    expect(f.posts.find((p) => p.path === '/keep')?.body).toMatchObject({
      take: 'kept-1',
      result: { score: 91 },
      engine: INFO.version,
      dismissed: ['m1'],
      hints: [[1.25, { w: 40, what: 'word' }]],
    });
  });

  it.each([['failed', 'error'], ['left', 'left']] as const)('a take that %s keeps nothing', async (_n, how) => {
    const f = fakes();
    await reportPhoneTake(keptEnd({ how, result: null }), INFO, {}, f.d);
    expect(f.wavs).toHaveLength(0);
  });

  it('a take longer than the server’s cap keeps nothing', async () => {
    const f = fakes();
    await reportPhoneTake(keptEnd({ samples: 15 * 60 * 16000 + 1 }), INFO, {}, f.d);
    expect(f.wavs).toHaveLength(0);
  });

  it('a service without the routes is nothing to send, and never throws', async () => {
    const f = fakes({
      post: async () => ({ ok: false, status: 404 }),
      postWav: async () => ({ status: 404, body: '{"error":"not_here"}' }),
    });
    await expect(reportPhoneTake(keptEnd(), INFO, {}, f.d)).resolves.toBeUndefined();
    expect(await labelPhoneTake('dismiss', 'e1', 'm2', 1, f.d)).toBe(false);
    expect(f.d.label).not.toHaveBeenCalled();
  });

  it('a failure anywhere is swallowed', async () => {
    const f = fakes({
      headers: async () => {
        throw new Error('offline');
      },
    });
    await expect(reportPhoneTake(keptEnd(), INFO, {}, f.d)).resolves.toBeUndefined();
  });

  it('the audio is not sent again when its result is refused', async () => {
    const f = fakes({ post: async () => ({ ok: false, status: 500 }) });
    await reportPhoneTake(keptEnd(), INFO, {}, f.d);
    expect(f.wavs).toHaveLength(1);
  });

  it('a “Not a mistake” after Stop waits for the kept name, and goes under it', async () => {
    let land: (v: { status: number; body: string }) => void = () => undefined;
    const f = fakes({ postWav: () => new Promise((r) => (land = r)) });
    const report = reportPhoneTake(keptEnd(), INFO, {}, f.d);
    const label = labelPhoneTake('dismiss', 'e1', 'm2', 5, f.d);
    for (let i = 0; i < 10; i++) await Promise.resolve(); // the sign-in headers, then the upload starts
    land({ status: 200, body: JSON.stringify({ take: 'kept-9' }) });
    await report;
    expect(await label).toBe(true);
    expect(f.d.label).toHaveBeenCalledWith('dismiss', 'kept-9', 'm2', 5);
  });

  it('frames too long for the server go without them; the result still goes', () => {
    const big = keepBody('k', keptEnd({ events: [{ text: 'x'.repeat(2_100_000) }] }), INFO) as string;
    expect(JSON.parse(big)).toMatchObject({ take: 'k', events: null, result: { score: 91 } });
    expect(keepBody('k', keptEnd({ result: { text: 'x'.repeat(2_100_000) } }), INFO)).toBeNull();
    expect(keepBody('k', keptEnd({ result: null }), INFO)).toBeNull();
  });
});
