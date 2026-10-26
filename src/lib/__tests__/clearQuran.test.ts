jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('../releaseInfo', () => ({ currentRelease: () => ({ channel: 'preview' }) }));

import {
  CLEAR_QURAN_API,
  ClearQuranDeps,
  ClearQuranError,
  clearQuranErrorHint,
  clearQuranSegments,
  forgetClearQuranVerses,
  getClearQuranVerse,
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

describe('getClearQuranVerse', () => {
  it('asks our worker, never The Clear Quran directly, with the sign-in and the channel', async () => {
    const { d, fetch } = deps([json(200, { verse_key: '2:255', text: 'Allah! There is no god ˹worthy of worship˺ except Him' })]);
    expect(await getClearQuranVerse(2, 255, d)).toBe('Allah! There is no god ˹worthy of worship˺ except Him');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${CLEAR_QURAN_API}/verses/2:255`);
    expect(String(url)).not.toContain('theclearquran.org');
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer id-token', 'X-Revisely-Channel': 'production' });
  });

  it('development builds say so (the worker uses the sandbox key)', async () => {
    const { d, fetch } = deps([json(200, { verse_key: '1:1', text: 'x' })], { channel: null });
    await getClearQuranVerse(1, 1, d);
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ 'X-Revisely-Channel': 'development' });
  });

  it('keeps a verse in memory for this launch: one request per verse', async () => {
    const { d, fetch } = deps([json(200, { verse_key: '1:1', text: 'In the Name of Allah' })]);
    await getClearQuranVerse(1, 1, d);
    expect(await getClearQuranVerse(1, 1, d)).toBe('In the Name of Allah');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired sign-in once, then succeeds', async () => {
    const { d, tokens } = deps([json(401, {}), json(200, { verse_key: '1:2', text: 'All praise' })]);
    expect(await getClearQuranVerse(1, 2, d)).toBe('All praise');
    expect(tokens).toEqual([false, true]);
  });

  it.each([
    ['UNAUTHENTICATED', () => [json(401, {}), json(401, {})]],
    ['RATE_LIMITED', () => [json(429, {})]],
    ['NOT_FOUND', () => [json(404, {})]],
    ['UNAVAILABLE', () => [json(502, {})]],
    ['UNAVAILABLE', () => [json(503, {})]],
    ['UNAVAILABLE', () => [json(200, { verse_key: '9:9', text: 'another verse' })]],
    ['UNAVAILABLE', () => [json(200, { verse_key: '1:3', text: '' })]],
    ['NETWORK', () => []],
  ])('fails with %s, and remembers nothing', async (code, responses) => {
    const { d } = deps(responses());
    await expect(getClearQuranVerse(1, 3, d)).rejects.toMatchObject({ code });
    const again = deps([json(200, { verse_key: '1:3', text: 'Most Compassionate' })]);
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
    expect(clearQuranErrorHint(new Error('arabic failed'))).toMatch(/connection/);
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
