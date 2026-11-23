// Recite's pack on the phone (BEHAVIOUR.md ONDEV-2, ONDEV-3): what the app accepts from the callable, and when it may
// download. The run around it is src/lib/onDevice/__tests__/packRun.test.ts; the callable's own refusals are
// functions/src/__tests__/recitePack.test.ts; the native readers against the sealed format, scripts/recite-pack-check.

import fc from 'fast-check';
import { mayDownloadPack, PACK_WRAP, parsePackAnswer, partsToFetch, type PackOnPhone } from '../../../src/lib/onDevice/pack';

const SHA = (c: string) => c.repeat(64);
const good = (over: Record<string, unknown> = {}) => ({
  packId: 'v7m-1',
  format: 1,
  wrap: PACK_WRAP,
  wrappedKey: 'V1JBUFBFRA==',
  parts: [
    { part: 'core', url: 'https://storage.googleapis.com/b/packs/recite/v7m-1/core.rcpk?s=1', bytes: 48_000_000, sha256: SHA('a') },
    { part: 'strict', url: 'https://storage.googleapis.com/b/packs/recite/v7m-1/strict.rcpk?s=1', bytes: 17_000_000, sha256: SHA('b') },
  ],
  expiresAt: 1_000_000,
  ...over,
});

describe('Recite’s pack', () => {
  it('[ONDEV-2] fetches a part only from Cloud Storage: any other address refuses the whole answer', () => {
    const host = fc.domain().filter((d) => d !== 'storage.googleapis.com');
    fc.assert(
      fc.property(host, fc.constantFrom('https', 'http'), (d, scheme) => {
        const a = good();
        a.parts[1] = { ...a.parts[1], url: `${scheme}://${d}/packs/recite/v7m-1/strict.rcpk` };
        expect(parsePackAnswer(a)).toBeNull();
      }),
    );
    expect(parsePackAnswer(good())).not.toBeNull();
  });

  it('[ONDEV-2] takes the key only wrapped, in the one form the phone can open', () => {
    fc.assert(
      fc.property(fc.string().filter((w) => w !== PACK_WRAP), (wrap) => {
        expect(parsePackAnswer(good({ wrap }))).toBeNull();
      }),
    );
    expect(parsePackAnswer({ ...good(), wrap: undefined, key: 'plain' })).toBeNull();
    expect(parsePackAnswer(good({ parts: [good().parts[1]] }))).toBeNull(); // nothing works without the core part
  });

  it('[ONDEV-3] downloads only on an unmetered connection, unless mobile data is on or allowed once', () => {
    const net = fc.record({ connected: fc.boolean(), type: fc.constantFrom('wifi', 'cellular', 'ethernet', 'unknown'), expensive: fc.boolean() });
    fc.assert(
      fc.property(net, fc.boolean(), fc.boolean(), (n, cellular, once) => {
        const unmetered = (n.type === 'wifi' || n.type === 'ethernet') && !n.expensive;
        expect(mayDownloadPack(n, { cellular, once })).toBe(n.connected && (unmetered || cellular || once));
      }),
    );
    expect(mayDownloadPack(null, { cellular: true, once: true })).toBe(false);
  });

  it('[ONDEV-3] fetches what isn’t here whole, and all of a new pack', () => {
    const answer = parsePackAnswer(good())!;
    const held = fc.record({ core: fc.boolean(), strict: fc.boolean(), samePack: fc.boolean(), stale: fc.boolean() });
    fc.assert(
      fc.property(held, ({ core, strict, samePack, stale }) => {
        const have: PackOnPhone = { packId: samePack ? 'v7m-1' : 'v7m-0', parts: {} };
        if (core) have.parts.core = { bytes: answer.parts[0].bytes, sha256: stale ? SHA('c') : answer.parts[0].sha256 };
        if (strict) have.parts.strict = { bytes: answer.parts[1].bytes, sha256: answer.parts[1].sha256 };
        const got = partsToFetch(answer, have).map((p) => p.part);
        const want = !samePack
          ? ['core', 'strict']
          : [...(!core || stale ? ['core'] : []), ...(!strict ? ['strict'] : [])];
        expect(got).toEqual(want);
      }),
    );
  });
});
