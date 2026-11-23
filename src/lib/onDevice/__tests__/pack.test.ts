import { mayDownloadPack, PACK_WRAP, parsePackAnswer, partsToFetch, urlsStillGood, type PackAnswer } from '../pack';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const url = (part: string) => `https://storage.googleapis.com/revisely-dev.firebasestorage.app/packs/recite/v7m-1/${part}.rcpk?X-Goog-Signature=abc`;

const raw = () => ({
  packId: 'v7m-1',
  format: 1,
  wrap: PACK_WRAP,
  wrappedKey: 'QUJDRA==',
  parts: [
    { part: 'core', url: url('core'), bytes: 47_000_000, sha256: SHA_A },
    { part: 'strict', url: url('strict'), bytes: 23_000_000, sha256: SHA_B },
  ],
  expiresAt: 1_000_000,
});

describe('parsePackAnswer', () => {
  it('reads a good answer', () => {
    const a = parsePackAnswer(raw())!;
    expect(a.packId).toBe('v7m-1');
    expect(a.parts.map((p) => p.part)).toEqual(['core', 'strict']);
  });

  it.each([
    ['another format', { format: 2 }],
    ['another wrap', { wrap: 'NONE' }],
    ['a bad pack id', { packId: '../evil' }],
    ['a wrapped key that isn’t base64', { wrappedKey: 'not base64!' }],
    ['no parts', { parts: [] }],
    ['no expiry', { expiresAt: 'soon' }],
  ])('refuses %s', (_name, over) => {
    expect(parsePackAnswer({ ...raw(), ...over })).toBeNull();
  });

  it.each([
    ['plain http', 'http://storage.googleapis.com/x'],
    ['another host', 'https://evil.example/core.rcpk'],
    ['a host that only starts the same', 'https://storage.googleapis.com.evil.example/x'],
    ['a file URL', 'file:///etc/passwd'],
  ])('refuses a part URL on %s', (_name, bad) => {
    const r = raw();
    r.parts[0].url = bad;
    expect(parsePackAnswer(r)).toBeNull();
  });

  it('refuses a repeated part, an unknown part, or no core', () => {
    const r = raw();
    expect(parsePackAnswer({ ...r, parts: [r.parts[0], r.parts[0]] })).toBeNull();
    expect(parsePackAnswer({ ...r, parts: [{ ...r.parts[0], part: 'extra' }] })).toBeNull();
    expect(parsePackAnswer({ ...r, parts: [r.parts[1]] })).toBeNull();
  });
});

describe('partsToFetch', () => {
  const answer = parsePackAnswer(raw()) as PackAnswer;
  const both = { core: { bytes: 47_000_000, sha256: SHA_A }, strict: { bytes: 23_000_000, sha256: SHA_B } };

  it('everything when nothing is here', () => {
    expect(partsToFetch(answer, null).map((p) => p.part)).toEqual(['core', 'strict']);
  });
  it('nothing when both are here', () => {
    expect(partsToFetch(answer, { packId: 'v7m-1', parts: both })).toEqual([]);
  });
  it('only what’s missing', () => {
    expect(partsToFetch(answer, { packId: 'v7m-1', parts: { core: both.core } }).map((p) => p.part)).toEqual(['strict']);
  });
  it('a part of another size or hash comes again', () => {
    const parts = { core: { ...both.core, sha256: SHA_B }, strict: both.strict };
    expect(partsToFetch(answer, { packId: 'v7m-1', parts }).map((p) => p.part)).toEqual(['core']);
  });
  it('everything for a new pack: it has a new key', () => {
    expect(partsToFetch(answer, { packId: 'v7m-0', parts: both }).map((p) => p.part)).toEqual(['core', 'strict']);
  });
});

describe('mayDownloadPack: the offline mushaf’s rule', () => {
  const off = { cellular: false, once: false };
  it('Wi-Fi and Ethernet, yes', () => {
    expect(mayDownloadPack({ connected: true, type: 'wifi' }, off)).toBe(true);
    expect(mayDownloadPack({ connected: true, type: 'ethernet' }, off)).toBe(true);
  });
  it('mobile data and metered Wi-Fi, no', () => {
    expect(mayDownloadPack({ connected: true, type: 'cellular' }, off)).toBe(false);
    expect(mayDownloadPack({ connected: true, type: 'wifi', expensive: true }, off)).toBe(false);
  });
  it('mobile data with the setting on, or for one Download now', () => {
    expect(mayDownloadPack({ connected: true, type: 'cellular' }, { cellular: true, once: false })).toBe(true);
    expect(mayDownloadPack({ connected: true, type: 'cellular' }, { cellular: false, once: true })).toBe(true);
  });
  it('never offline or before NetInfo has said', () => {
    expect(mayDownloadPack({ connected: false, type: 'wifi' }, { cellular: true, once: true })).toBe(false);
    expect(mayDownloadPack(null, { cellular: true, once: true })).toBe(false);
  });
});

describe('urlsStillGood', () => {
  it('asks again within a minute of the end', () => {
    expect(urlsStillGood({ expiresAt: 200_000 }, 100_000)).toBe(true);
    expect(urlsStillGood({ expiresAt: 150_000 }, 100_000)).toBe(false);
    expect(urlsStillGood({ expiresAt: 50_000 }, 100_000)).toBe(false);
  });
});
