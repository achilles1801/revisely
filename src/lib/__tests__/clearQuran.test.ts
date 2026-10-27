jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('../releaseInfo', () => ({ currentRelease: () => ({ channel: 'preview' }) }));

import {
  CLEAR_QURAN_API,
  CLEAR_QURAN_DEVICE_CACHE,
  clearQuranBlock,
  ClearQuranDeps,
  ClearQuranError,
  clearQuranErrorHint,
  clearQuranSegments,
  forgetClearQuranVerses,
  getClearQuranVerse,
  peekClearQuranVerse,
  prefetchClearQuran,
  prefetchClearQuranAround,
} from '../clearQuran';


const json = (status: number, body: unknown) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

function deps(responses: Response[], { channel = 'production' as string | null, token = 'id-token' } = {}) {
  const fetch = jest.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
    const next = responses.shift();
    if (!next) throw new TypeError('Network request failed');
    return next;
  });
  const tokens: boolean[] = [];
  const d: ClearQuranDeps = {
    token: async (force) => {
      tokens.push(force);
      return token || null;
    },
    channel: () => channel,
    fetch: fetch as unknown as typeof globalThis.fetch,
  };
  return { d, fetch, tokens };
}

beforeEach(() => forgetClearQuranVerses());

/** The worker's answer for a block: verses from..to of one surah. */
function block(sura: number, from: number, to: number, text = (key: string) => `The text of ${key}`) {
  const verses = [];
  for (let n = from; n <= to; n++) verses.push({ verse_key: `${sura}:${n}`, text: text(`${sura}:${n}`) });
  return json(200, { surah: sura, from, to, verses });
}

/** A worker that answers each block request from the path, like the real one. */
function worker() {
  const urls: string[] = [];
  const d: ClearQuranDeps = {
    token: async () => 'id-token',
    channel: () => 'preview',
    fetch: (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      const [sura, ayah] = String(url).split('/windows/')[1].split(':').map(Number);
      const b = clearQuranBlock(sura, ayah);
      return block(sura, b.from, b.to);
    }) as typeof globalThis.fetch,
  };
  return { d, urls };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe('getClearQuranVerse', () => {
  it('asks our worker, never The Clear Quran directly, with the sign-in and the channel', async () => {
    const { d, fetch } = deps([block(2, 241, 270, (k) => (k === '2:255' ? 'Allah! There is no god ˹worthy of worship˺ except Him' : 'x'))]);
    expect(await getClearQuranVerse(2, 255, d)).toBe('Allah! There is no god ˹worthy of worship˺ except Him');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${CLEAR_QURAN_API}/windows/2:255`);
    expect(String(url)).not.toContain('theclearquran.org');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer id-token', 'X-Revisely-Channel': 'production' });
  });

  it('development builds say so (the worker uses the sandbox key)', async () => {
    const { d, fetch } = deps([block(1, 1, 7)], { channel: null });
    await getClearQuranVerse(1, 1, d);
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ 'X-Revisely-Channel': 'development' });
  });

  it('one request brings the whole block: its other verses are instant, for this launch', async () => {
    const { d, fetch } = deps([block(2, 31, 60)]);
    expect(await getClearQuranVerse(2, 45, d)).toBe('The text of 2:45');
    expect(peekClearQuranVerse(2, 31)).toBe('The text of 2:31');
    expect(peekClearQuranVerse(2, 60)).toBe('The text of 2:60');
    expect(peekClearQuranVerse(2, 61)).toBeUndefined();
    expect(await getClearQuranVerse(2, 60, d)).toBe('The text of 2:60');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('a block asked for twice at once is fetched once', async () => {
    const { d, urls } = worker();
    const [a, b] = await Promise.all([getClearQuranVerse(2, 33, d), getClearQuranVerse(2, 58, d)]);
    expect([a, b]).toEqual(['The text of 2:33', 'The text of 2:58']);
    expect(urls).toEqual([`${CLEAR_QURAN_API}/windows/2:33`]);
  });

  it('blocks are aligned 30-verse blocks of one surah (the worker tests check every verse)', () => {
    expect(clearQuranBlock(2, 1)).toEqual({ sura: 2, from: 1, to: 30 });
    expect(clearQuranBlock(2, 31)).toEqual({ sura: 2, from: 31, to: 60 });
    expect(clearQuranBlock(2, 286)).toEqual({ sura: 2, from: 271, to: 286 });
    expect(clearQuranBlock(112, 4)).toEqual({ sura: 112, from: 1, to: 4 });
  });

  it('a worker from before blocks (400): this verse alone', async () => {
    const { d, fetch } = deps([json(400, {}), json(200, { verse_key: '1:2', text: 'All praise' })]);
    expect(await getClearQuranVerse(1, 2, d)).toBe('All praise');
    expect(fetch.mock.calls.map(([u]) => u)).toEqual([`${CLEAR_QURAN_API}/windows/1:2`, `${CLEAR_QURAN_API}/verses/1:2`]);
    expect(peekClearQuranVerse(1, 3)).toBeUndefined();
  });

  it('a block of one verse (the worker fell back to single verses) still answers the others', async () => {
    const { d } = deps([
      json(200, { surah: 2, from: 40, to: 40, verses: [{ verse_key: '2:40', text: 'forty' }] }),
      json(200, { surah: 2, from: 41, to: 41, verses: [{ verse_key: '2:41', text: 'forty-one' }] }),
    ]);
    expect(await getClearQuranVerse(2, 40, d)).toBe('forty');
    expect(await getClearQuranVerse(2, 41, d)).toBe('forty-one');
  });

  it('refreshes an expired sign-in once, then succeeds', async () => {
    const { d, tokens } = deps([json(401, {}), block(1, 1, 7, () => 'All praise')]);
    expect(await getClearQuranVerse(1, 2, d)).toBe('All praise');
    expect(tokens).toEqual([false, true]);
  });

  it.each([
    ['UNAUTHENTICATED', () => [json(401, {}), json(401, {})]],
    ['RATE_LIMITED', () => [json(429, {})]],
    ['DAILY_LIMIT', () => [json(429, { error: { code: 'DAILY_LIMIT', message: 'Daily limit reached' } })]],
    ['NOT_FOUND', () => [json(404, {})]],
    ['UNAVAILABLE', () => [json(502, {})]],
    ['UNAVAILABLE', () => [json(503, {})]],
    ['UNAVAILABLE', () => [json(200, { verse_key: '9:9', text: 'another verse' })]],
    ['UNAVAILABLE', () => [block(9, 1, 7)]],
    ['UNAVAILABLE', () => [json(200, { surah: 1, from: 1, to: 7, verses: [] })]],
    ['UNAVAILABLE', () => [json(200, { surah: 1, from: 4, to: 7, verses: [] })]],
    ['UNAVAILABLE', () => [block(1, 1, 7, (k) => (k === '1:5' ? '' : 'x'))]],
    ['NETWORK', () => []],
  ])('fails with %s, and remembers nothing', async (code, responses) => {
    const { d } = deps(responses());
    await expect(getClearQuranVerse(1, 3, d)).rejects.toMatchObject({ code });
    expect(peekClearQuranVerse(1, 1)).toBeUndefined();
    const again = deps([block(1, 1, 7, () => 'Most Compassionate')]);
    expect(await getClearQuranVerse(1, 3, again.d)).toBe('Most Compassionate');
  });

  it('signed out: no request at all', async () => {
    const { d, fetch } = deps([], { token: '' });
    await expect(getClearQuranVerse(1, 1, d)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('the sheet’s hint for each failure', () => {
    expect(clearQuranErrorHint(new ClearQuranError('RATE_LIMITED', ''))).toMatch(/Try again in a minute/);
    expect(clearQuranErrorHint(new ClearQuranError('NETWORK', ''))).toMatch(/connection/);
    expect(clearQuranErrorHint(new ClearQuranError('DAILY_LIMIT', ''))).toMatch(/tomorrow/);
    expect(clearQuranErrorHint(new Error('arabic failed'))).toMatch(/connection/);
  });
});

const DAY = 86_400_000;
const THIRTY_DAYS = 30 * 86_400;

/** A phone: files that outlive a launch, a clock, and a worker with a cache policy. */
function phone(policy: unknown = { version: '1', device: { maxAgeSeconds: THIRTY_DAYS, staleSeconds: THIRTY_DAYS } }) {
  const files = new Map<string, string>();
  let clock = Date.UTC(2026, 9, 27, 12);
  let current = policy;
  let failBlocks = false;
  const urls: string[] = [];
  const d: ClearQuranDeps = {
    token: async () => 'id-token',
    channel: () => 'preview',
    fetch: (async (url: RequestInfo | URL) => {
      urls.push(String(url));
      if (String(url).endsWith('/policy')) return json(200, current);
      if (failBlocks) throw new TypeError('Network request failed');
      const [sura, ayah] = String(url).split('/windows/')[1].split(':').map(Number);
      const b = clearQuranBlock(sura, ayah);
      return block(sura, b.from, b.to);
    }) as typeof globalThis.fetch,
    store: {
      read: async (name) => files.get(name) ?? null,
      write: (name, text) => void files.set(name, text),
      clear: () => files.clear(),
    },
    now: () => clock,
  };
  return {
    d,
    files,
    blocks: () => urls.filter((u) => u.includes('/windows/')),
    later: (days: number) => (clock += days * DAY),
    setPolicy: (p: unknown) => (current = p),
    offline: (yes: boolean) => (failBlocks = yes),
    /** A new launch: memory goes, the files stay. */
    relaunch: () => forgetClearQuranVerses(),
  };
}

describe('kept on the phone', () => {
  it('a block read once is kept, exactly as given, and the next launch shows it without a request', async () => {
    const p = phone();
    expect(await getClearQuranVerse(2, 45, p.d)).toBe('The text of 2:45');
    await settle();
    const kept = JSON.parse(p.files.get('block-2-31.json')!);
    expect(kept.verses).toHaveLength(30);
    expect(kept.verses[14]).toEqual({ verse_key: '2:45', text: 'The text of 2:45' });

    p.relaunch();
    p.later(29);
    expect(await getClearQuranVerse(2, 50, p.d)).toBe('The text of 2:50');
    await settle();
    expect(p.blocks()).toHaveLength(1);
  });

  it('after 30 days: shown at once, and fetched again behind it', async () => {
    const p = phone();
    await getClearQuranVerse(2, 45, p.d);
    await settle();
    p.relaunch();
    p.later(31);
    expect(await getClearQuranVerse(2, 45, p.d)).toBe('The text of 2:45');
    await settle();
    expect(p.blocks()).toHaveLength(2);
    expect(JSON.parse(p.files.get('block-2-31.json')!).fetchedAt).toBe(Date.UTC(2026, 9, 27, 12) + 31 * DAY);
  });

  it('a stale copy still shows offline; one past both times is not shown', async () => {
    const p = phone();
    await getClearQuranVerse(2, 45, p.d);
    await settle();
    p.relaunch();
    p.offline(true);
    p.later(45);
    expect(await getClearQuranVerse(2, 45, p.d)).toBe('The text of 2:45');
    p.relaunch();
    p.later(20); // 65 days
    await expect(getClearQuranVerse(2, 45, p.d)).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('the worker can shorten the time: it applies to what is kept', async () => {
    const p = phone();
    await getClearQuranVerse(2, 45, p.d);
    await settle();
    p.setPolicy({ version: '1', device: { maxAgeSeconds: 86_400, staleSeconds: 0 } });
    p.relaunch();
    p.later(2);
    await getClearQuranVerse(2, 45, p.d); // the old policy is read first; the new one arrives behind
    await settle();
    p.relaunch();
    p.later(2);
    p.offline(true);
    await expect(getClearQuranVerse(2, 45, p.d)).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('0 from the worker deletes every copy and keeps nothing more', async () => {
    const p = phone();
    await getClearQuranVerse(2, 45, p.d);
    await settle();
    p.setPolicy({ version: '1', device: { maxAgeSeconds: 0, staleSeconds: 0 } });
    p.relaunch();
    await getClearQuranVerse(3, 1, p.d);
    await settle();
    expect([...p.files.keys()]).toEqual(['policy.json']);
    p.relaunch();
    await getClearQuranVerse(4, 1, p.d);
    await settle();
    expect([...p.files.keys()]).toEqual(['policy.json']);
  });

  it("a new cache version from the worker, or in the app, deletes every copy", async () => {
    const p = phone();
    await getClearQuranVerse(2, 45, p.d);
    await settle();
    p.setPolicy({ version: '2', device: { maxAgeSeconds: THIRTY_DAYS, staleSeconds: THIRTY_DAYS } });
    p.relaunch();
    await getClearQuranVerse(3, 1, p.d); // this launch asks the worker, which has a new version
    await settle();
    expect(p.files.has('block-2-31.json')).toBe(false);

    await getClearQuranVerse(2, 45, p.d);
    await settle();
    expect(p.files.has('block-2-31.json')).toBe(true);
    // An update of the app with a new CLEAR_QURAN_DEVICE_CACHE.version starts clean.
    const saved = JSON.parse(p.files.get('policy.json')!);
    p.files.set('policy.json', JSON.stringify({ ...saved, app: CLEAR_QURAN_DEVICE_CACHE.version - 1 }));
    p.relaunch();
    await getClearQuranVerse(5, 1, p.d);
    await settle();
    expect(p.files.has('block-2-31.json')).toBe(false);
  });

  it('a damaged copy is ignored and fetched again; a single verse from an older worker is not kept', async () => {
    const p = phone();
    p.files.set('block-2-31.json', '{"surah":2,"from":31,"to":60,"fetchedAt":0,"verses":[{"verse_key":"2:31"}]}');
    expect(await getClearQuranVerse(2, 45, p.d)).toBe('The text of 2:45');
    expect(p.blocks()).toHaveLength(1);

    const old = phone();
    const fetch = old.d.fetch;
    old.d.fetch = (async (url: RequestInfo | URL, init?: RequestInit) =>
      String(url).includes('/windows/')
        ? json(400, {})
        : String(url).includes('/verses/')
          ? json(200, { verse_key: '7:1', text: 'Alif-Lãm-Mĩm-Ṣãd.' })
          : fetch(url, init)) as typeof globalThis.fetch;
    forgetClearQuranVerses();
    expect(await getClearQuranVerse(7, 1, old.d)).toBe('Alif-Lãm-Mĩm-Ṣãd.');
    await settle();
    expect([...old.files.keys()].filter((k) => k.startsWith('block-'))).toEqual([]);
  });

  it('without the worker’s policy (offline, or a worker from before): the app’s own times', async () => {
    const p = phone({ nope: true });
    await getClearQuranVerse(2, 45, p.d);
    await settle();
    expect(p.files.has('block-2-31.json')).toBe(true);
    // And the next launch still has it (it isn't taken for a first run).
    p.relaunch();
    expect(await getClearQuranVerse(2, 46, p.d)).toBe('The text of 2:46');
    await settle();
    expect(p.blocks()).toHaveLength(1);
    expect(CLEAR_QURAN_DEVICE_CACHE).toMatchObject({ maxAgeSeconds: THIRTY_DAYS, staleSeconds: THIRTY_DAYS });
  });
});

describe('fetching ahead', () => {
  it('two verses either side: the next block only near its edge, never twice', async () => {
    const { d, urls } = worker();
    await getClearQuranVerse(2, 15, d);
    prefetchClearQuranAround({ sura: 2, ayah: 15 }, 2, d);
    await settle();
    expect(urls).toHaveLength(1); // 2:13–17 are all in 2:1–30

    prefetchClearQuranAround({ sura: 2, ayah: 29 }, 2, d);
    prefetchClearQuranAround({ sura: 2, ayah: 30 }, 2, d);
    await settle();
    expect(urls).toEqual([`${CLEAR_QURAN_API}/windows/2:15`, `${CLEAR_QURAN_API}/windows/2:31`]);
    expect(peekClearQuranVerse(2, 31)).toBe('The text of 2:31');
  });

  it('crosses into the next and previous surah', async () => {
    const { d, urls } = worker();
    await getClearQuranVerse(1, 7, d);
    prefetchClearQuranAround({ sura: 1, ayah: 7 }, 2, d);
    await settle();
    expect(urls).toEqual([`${CLEAR_QURAN_API}/windows/1:7`, `${CLEAR_QURAN_API}/windows/2:1`]);
    prefetchClearQuranAround({ sura: 2, ayah: 1 }, 2, d);
    await settle();
    expect(urls).toHaveLength(2); // 1:6–7 and 2:2–3 are here already
  });

  it('a failed fetch ahead is quiet, and the verse is fetched again when asked for', async () => {
    const { d, fetch } = deps([json(502, {}), block(3, 1, 30)]);
    prefetchClearQuran(3, 1, d);
    await settle();
    expect(peekClearQuranVerse(3, 1)).toBeUndefined();
    expect(await getClearQuranVerse(3, 1, d)).toBe('The text of 3:1');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe('clearQuranSegments: the text exactly as given', () => {
  it('plain text, brackets and dashes untouched', () => {
    const t = 'You ˹alone˺ we worship—and You ˹alone˺ we ask for help.';
    expect(clearQuranSegments(t)).toEqual([{ text: t }]);
  });

  it('footnote markers become their raised numbers; nothing else changes', () => {
    expect(clearQuranSegments('Most Merciful.<footnote id="1" number="1"></footnote> All praise')).toEqual([
      { text: 'Most Merciful.' },
      { footnote: '¹' },
      { text: ' All praise' },
    ]);
    expect(clearQuranSegments('worlds,<footnote id="22" number="12">12</footnote>')).toEqual([
      { text: 'worlds,' },
      { footnote: '¹²' },
    ]);
    expect(clearQuranSegments('a<footnote id="3" number="2">b')).toEqual([
      { text: 'a' },
      { footnote: '²' },
      { text: 'b' },
    ]);
  });

  it('any other markup: shown exactly as given', () => {
    const odd = 'He said <i>peace</i>.';
    expect(clearQuranSegments(odd)).toEqual([{ text: odd }]);
    const inner = 'x<footnote id="1" number="1">a note</footnote>';
    expect(clearQuranSegments(inner)).toEqual([{ text: inner }]);
  });
});
